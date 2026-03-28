from main import RuleEngine


def test_rule_engine_fields():
    result = RuleEngine.evaluate('RELIANCE', 120)
    assert 'score' in result
    assert 'should_trigger' in result
    assert result['symbol'] == 'RELIANCE'
    assert result['price'] == 120
