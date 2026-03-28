import asyncio
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Dict, List

import httpx
from fastapi import FastAPI
from pydantic import BaseModel, Field

BACKEND_URL = os.getenv('BACKEND_URL', 'http://backend:8080')
PREFILTER_INTERVAL_SEC = int(os.getenv('PREFILTER_INTERVAL_SEC', '10'))

MOMENTUM_MODULUS = int(os.getenv('PREFILTER_MOMENTUM_MODULUS', '10'))
VOLUME_MODULUS = int(os.getenv('PREFILTER_VOLUME_MODULUS', '7'))
MOMENTUM_WEIGHT = float(os.getenv('PREFILTER_MOMENTUM_WEIGHT', '0.6'))
VOLUME_WEIGHT = float(os.getenv('PREFILTER_VOLUME_WEIGHT', '0.4'))
TRIGGER_THRESHOLD = float(os.getenv('PREFILTER_TRIGGER_THRESHOLD', '4.2'))
MOCK_BASE_PRICE = 100
MOCK_PRICE_VARIANCE = 50
IST_ZONE = ZoneInfo('Asia/Kolkata')

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


async def send_trigger(payload: Dict):
    async with httpx.AsyncClient(timeout=10) as client:
      await client.post(f'{BACKEND_URL}/api/analyze', json=payload)


async def prefilter_loop():
    while True:
      if is_indian_market_open():
          stocks = await fetch_stocks()
          for sym in stocks:
              symbol = normalize_indian_symbol(sym)
              price = MOCK_BASE_PRICE + (sum(ord(c) for c in symbol) % MOCK_PRICE_VARIANCE)
              result = RuleEngine.evaluate(symbol, float(price))
              if result['should_trigger']:
                  await send_trigger({
                      'symbol': symbol,
                      'price': result['price']
                  })
      await asyncio.sleep(PREFILTER_INTERVAL_SEC)


@app.on_event('startup')
async def on_startup():
    asyncio.create_task(prefilter_loop())


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
        if round(mw + vw, 6) != 1:
            return {'updated': False, 'error': 'momentumWeight + volumeWeight must equal 1'}
    updated = RuleEngine.update_config(payload)
    return {'updated': True, 'config': updated}
