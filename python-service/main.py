import asyncio
import logging
import os
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Dict, List, TypedDict

import httpx
from fastapi import FastAPI
from pydantic import BaseModel, Field

BACKEND_URL = os.getenv('BACKEND_URL', 'http://backend:8080')
ADMIN_API_KEY = os.getenv('ADMIN_API_KEY', '')
PREFILTER_INTERVAL_SEC = int(os.getenv('PREFILTER_INTERVAL_SEC', '10'))
ONE_SECOND_INTERVAL_SEC = int(os.getenv('PREFILTER_ONE_SEC_INTERVAL', '1'))
FIVE_SECOND_INTERVAL_SEC = int(os.getenv('PREFILTER_FIVE_SEC_INTERVAL', '5'))
SIXTY_SECOND_INTERVAL_SEC = int(os.getenv('PREFILTER_SIXTY_SEC_INTERVAL', '60'))
CONFIG_REFRESH_SEC = int(os.getenv('PREFILTER_CONFIG_REFRESH_SEC', '30'))
DEFAULT_ONE_SEC_MAX = 5
DEFAULT_TRADE_ONE_SEC_MAX = 5
DEFAULT_FIVE_SEC_MAX = 10
DEFAULT_SIXTY_SEC_MAX = 50

MOMENTUM_MODULUS = int(os.getenv('PREFILTER_MOMENTUM_MODULUS', '10'))
VOLUME_MODULUS = int(os.getenv('PREFILTER_VOLUME_MODULUS', '7'))
MOMENTUM_WEIGHT = float(os.getenv('PREFILTER_MOMENTUM_WEIGHT', '0.6'))
VOLUME_WEIGHT = float(os.getenv('PREFILTER_VOLUME_WEIGHT', '0.4'))
TRIGGER_THRESHOLD = float(os.getenv('PREFILTER_TRIGGER_THRESHOLD', '4.2'))
MOCK_BASE_PRICE = 100
MOCK_PRICE_VARIANCE = 50
IST_ZONE = ZoneInfo('Asia/Kolkata')
WEIGHT_SUM_TOLERANCE = 0.0001

logger = logging.getLogger(__name__)


class ConfigCache(TypedDict):
    """Cached admin config payload and fetch timestamp."""
    data: Dict
    fetched_at: float


CONFIG_LOCK = asyncio.Lock()
BUCKET_LOCK = asyncio.Lock()
CONFIG_CACHE: ConfigCache = {'data': {}, 'fetched_at': 0.0}
BUCKET_CACHE: Dict[str, List[str]] = {'oneSecond': [], 'fiveSecond': [], 'sixtySecond': []}

app = FastAPI(title='Oracle Python Service')


def normalize_indian_symbol(symbol: str) -> str:
    normalized = str(symbol or '').strip().upper()
    if not normalized:
        return normalized
    return normalized if normalized.endswith('.NS') else f'{normalized}.NS'


def is_indian_market_open(now: datetime | None = None) -> bool:
    current = now.astimezone(IST_ZONE) if now else datetime.now(IST_ZONE)
    if current.weekday() >= 5:
        return False
    total_minutes = current.hour * 60 + current.minute
    return (9 * 60 + 15) <= total_minutes <= (15 * 60 + 30)


class TriggerPayload(BaseModel):
    symbol: str = Field(..., min_length=1)
    price: float = Field(100.0, gt=0)
    source: str = 'python_prefilter'


class RuleEngine:
    config: Dict[str, float] = {
        'momentumModulus': MOMENTUM_MODULUS,
        'volumeModulus': VOLUME_MODULUS,
        'momentumWeight': MOMENTUM_WEIGHT,
        'volumeWeight': VOLUME_WEIGHT,
        'triggerThreshold': TRIGGER_THRESHOLD
    }

    @classmethod
    def update_config(cls, config: Dict[str, float]) -> Dict[str, float]:
      unknown_keys = [key for key in config.keys() if key not in cls.config]
      if unknown_keys:
          raise ValueError(f'Unknown config keys: {",".join(unknown_keys)}')
      for key in cls.config:
          if key in config and config[key] is not None:
              cls.config[key] = config[key]
      return cls.config

    @staticmethod
    def evaluate(symbol: str, price: float) -> Dict:
      momentum_modulus = max(1, int(RuleEngine.config['momentumModulus']))
      volume_modulus = max(1, int(RuleEngine.config['volumeModulus']))
      momentum_weight = float(RuleEngine.config['momentumWeight'])
      volume_weight = float(RuleEngine.config['volumeWeight'])
      trigger_threshold = float(RuleEngine.config['triggerThreshold'])
      momentum = (sum(ord(c) for c in symbol) % momentum_modulus) / momentum_modulus
      volume_spike = (int(price * 100) % volume_modulus) / volume_modulus
      score = round((momentum * momentum_weight + volume_spike * volume_weight) * 10, 2)
      should_trigger = score >= trigger_threshold
      return {
          'symbol': symbol,
          'price': price,
          'score': score,
          'should_trigger': should_trigger,
          'rules': {
              'momentum': momentum,
              'volume_spike': volume_spike,
              'config': RuleEngine.config
          }
      }


async def fetch_stocks() -> List[str]:
    try:
      async with httpx.AsyncClient(timeout=5) as client:
        res = await client.get(f'{BACKEND_URL}/api/stocks')
        res.raise_for_status()
        return [x['symbol'] for x in res.json()]
    except Exception:
      return []


def dedupe_symbols(symbols: List[str]) -> List[str]:
    seen = set()
    unique = []
    for symbol in symbols:
        normalized = normalize_indian_symbol(symbol)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique.append(normalized)
    return unique


async def fetch_system_config() -> Dict:
    async with CONFIG_LOCK:
        now = time.time()
        if CONFIG_CACHE['data'] and (now - CONFIG_CACHE['fetched_at']) < CONFIG_REFRESH_SEC:
            return CONFIG_CACHE['data']
        try:
            headers = {'x-admin-key': ADMIN_API_KEY} if ADMIN_API_KEY else {}
            async with httpx.AsyncClient(timeout=6) as client:
                res = await client.get(f'{BACKEND_URL}/api/admin/config', headers=headers)
                res.raise_for_status()
                CONFIG_CACHE['data'] = res.json()
                CONFIG_CACHE['fetched_at'] = now
                return CONFIG_CACHE['data']
        except Exception:
            return CONFIG_CACHE['data'] or {}


def build_bucket_symbols(config: Dict, fallback_symbols: List[str]) -> Dict[str, List[str]]:
    buckets = config.get('watchlistBuckets') or {}
    one_bucket = buckets.get('oneSecond') or {}
    trade_bucket = buckets.get('tradeOneSecond') or {}
    five_bucket = buckets.get('fiveSecond') or {}
    sixty_bucket = buckets.get('sixtySecond') or {}

    one_raw = dedupe_symbols(one_bucket.get('symbols', []) or [])
    trade_raw = dedupe_symbols(trade_bucket.get('symbols', []) or [])
    five_raw = dedupe_symbols(five_bucket.get('symbols', []) or [])
    sixty_raw = dedupe_symbols(sixty_bucket.get('symbols', []) or [])

    one_max = int(one_bucket.get('maxSymbols') or DEFAULT_ONE_SEC_MAX)
    trade_max = int(trade_bucket.get('maxSymbols') or DEFAULT_TRADE_ONE_SEC_MAX)
    five_max = int(five_bucket.get('maxSymbols') or DEFAULT_FIVE_SEC_MAX)
    sixty_max = int(sixty_bucket.get('maxSymbols') or DEFAULT_SIXTY_SEC_MAX)

    one_symbols = one_raw[:one_max] if one_max > 0 else one_raw
    trade_fast = trade_raw[:trade_max] if trade_max > 0 else trade_raw
    trade_overflow = trade_raw[trade_max:] if trade_max > 0 else []
    five_symbols = five_raw[:five_max] if five_max > 0 else five_raw
    sixty_symbols = sixty_raw[:sixty_max] if sixty_max > 0 else sixty_raw

    if not (one_symbols or trade_fast or trade_overflow or five_symbols or sixty_symbols) and fallback_symbols:
        fallback = dedupe_symbols(fallback_symbols)
        sixty_symbols = fallback[:sixty_max] if sixty_max > 0 else fallback

    if trade_overflow:
        one_second = trade_fast
        five_pool = one_symbols + trade_overflow + five_symbols
    else:
        one_second = one_symbols + trade_fast
        five_pool = five_symbols

    one_second = dedupe_symbols(one_second)
    five_second = dedupe_symbols(five_pool)
    if five_max > 0:
        five_second = five_second[:five_max]

    occupied = set(one_second) | set(five_second)
    sixty_second = [symbol for symbol in sixty_symbols if symbol not in occupied]
    if sixty_max > 0:
        sixty_second = sixty_second[:sixty_max]

    return {'oneSecond': one_second, 'fiveSecond': five_second, 'sixtySecond': sixty_second}


async def refresh_bucket_cache_once():
    config = await fetch_system_config()
    fallback = await fetch_stocks()
    buckets = build_bucket_symbols(config, fallback)
    async with BUCKET_LOCK:
        BUCKET_CACHE.update(buckets)


async def refresh_bucket_cache_loop():
    while True:
        try:
            await refresh_bucket_cache_once()
        except Exception:
            logger.exception('Failed to refresh bucket cache')
        await asyncio.sleep(CONFIG_REFRESH_SEC)


async def send_trigger(payload: Dict):
    async with httpx.AsyncClient(timeout=10) as client:
      await client.post(f'{BACKEND_URL}/api/analyze', json=payload)


async def prefilter_bucket_loop(bucket: str, interval_sec: int):
    while True:
      try:
          if is_indian_market_open():
              async with BUCKET_LOCK:
                  symbols_ref = BUCKET_CACHE.get(bucket, [])
              symbols = list(symbols_ref)
              for sym in symbols:
                  symbol = normalize_indian_symbol(sym)
                  price = MOCK_BASE_PRICE + (sum(ord(c) for c in symbol) % MOCK_PRICE_VARIANCE)
                  result = RuleEngine.evaluate(symbol, float(price))
                  if result['should_trigger']:
                      try:
                          await send_trigger({
                              'symbol': symbol,
                              'price': result['price']
                          })
                      except Exception:
                          logger.warning('Failed to send trigger for %s', symbol, exc_info=True)
      except Exception:
          logger.exception('Error in %s bucket loop', bucket)
      await asyncio.sleep(interval_sec)


@app.on_event('startup')
async def on_startup():
    await refresh_bucket_cache_once()
    asyncio.create_task(refresh_bucket_cache_loop())
    asyncio.create_task(prefilter_bucket_loop('oneSecond', ONE_SECOND_INTERVAL_SEC))
    asyncio.create_task(prefilter_bucket_loop('fiveSecond', FIVE_SECOND_INTERVAL_SEC))
    asyncio.create_task(prefilter_bucket_loop('sixtySecond', SIXTY_SECOND_INTERVAL_SEC))


@app.get('/health')
async def health():
    return {'status': 'up', 'time': datetime.now(IST_ZONE).isoformat()}


@app.post('/prefilter/trigger')
async def trigger(payload: TriggerPayload):
    symbol = normalize_indian_symbol(payload.symbol)
    result = RuleEngine.evaluate(symbol, payload.price)
    if result['should_trigger']:
      await send_trigger({
          'symbol': symbol,
          'price': payload.price,
          'source': payload.source
      })
    return {'accepted': result['should_trigger'], 'analysis': result}


@app.post('/prefilter/config')
async def configure_prefilter(payload: Dict):
    momentum_weight = payload.get('momentumWeight')
    volume_weight = payload.get('volumeWeight')
    if momentum_weight is not None or volume_weight is not None:
        mw = float(momentum_weight if momentum_weight is not None else RuleEngine.config['momentumWeight'])
        vw = float(volume_weight if volume_weight is not None else RuleEngine.config['volumeWeight'])
        if abs((mw + vw) - 1) > WEIGHT_SUM_TOLERANCE:
            return {'updated': False, 'error': 'momentumWeight + volumeWeight must equal 1'}
    try:
        updated = RuleEngine.update_config(payload)
    except ValueError as exc:
        return {'updated': False, 'error': str(exc)}
    return {'updated': True, 'config': updated}
