import asyncio
import os
from datetime import datetime
from typing import Dict, List

import httpx
from fastapi import FastAPI
from pydantic import BaseModel, Field

BACKEND_URL = os.getenv('BACKEND_URL', 'http://backend:8080')
PREFILTER_INTERVAL_SEC = int(os.getenv('PREFILTER_INTERVAL_SEC', '10'))

MOMENTUM_MODULUS = 10
VOLUME_MODULUS = 7
MOMENTUM_WEIGHT = 0.6
VOLUME_WEIGHT = 0.4
TRIGGER_THRESHOLD = 4.2
MOCK_BASE_PRICE = 100
MOCK_PRICE_VARIANCE = 50

app = FastAPI(title='Oracle Python Service')


class TriggerPayload(BaseModel):
    symbol: str = Field(..., min_length=1)
    price: float = Field(100.0, gt=0)
    source: str = 'python_prefilter'


class RuleEngine:
    @staticmethod
    def evaluate(symbol: str, price: float) -> Dict:
      momentum = (sum(ord(c) for c in symbol) % MOMENTUM_MODULUS) / MOMENTUM_MODULUS
      volume_spike = (int(price * 100) % VOLUME_MODULUS) / VOLUME_MODULUS
      score = round((momentum * MOMENTUM_WEIGHT + volume_spike * VOLUME_WEIGHT) * 10, 2)
      should_trigger = score >= TRIGGER_THRESHOLD
      return {
          'symbol': symbol,
          'price': price,
          'score': score,
          'should_trigger': should_trigger,
          'rules': {
              'momentum': momentum,
              'volume_spike': volume_spike
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
      stocks = await fetch_stocks()
      for sym in stocks:
        price = MOCK_BASE_PRICE + (sum(ord(c) for c in sym) % MOCK_PRICE_VARIANCE)
        result = RuleEngine.evaluate(sym, float(price))
        if result['should_trigger']:
          await send_trigger({
              'symbol': sym,
              'price': result['price']
          })
      await asyncio.sleep(PREFILTER_INTERVAL_SEC)


@app.on_event('startup')
async def on_startup():
    asyncio.create_task(prefilter_loop())


@app.get('/health')
async def health():
    return {'status': 'up', 'time': datetime.utcnow().isoformat()}


@app.post('/prefilter/trigger')
async def trigger(payload: TriggerPayload):
    result = RuleEngine.evaluate(payload.symbol.upper(), payload.price)
    if result['should_trigger']:
      await send_trigger({
          'symbol': payload.symbol.upper(),
          'price': payload.price,
          'source': payload.source
      })
    return {'accepted': result['should_trigger'], 'analysis': result}
