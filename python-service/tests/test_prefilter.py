from main import RuleEngine


def test_rule_engine_fields():
    result = RuleEngine.evaluate('RELIANCE', 120)
    assert 'score' in result
    assert 'should_trigger' in result
    assert result['symbol'] == 'RELIANCE'
    assert result['price'] == 120


def test_rule_engine_expected_scoring_and_trigger_behavior():
    low = RuleEngine.evaluate('A', 0.07)
    high = RuleEngine.evaluate('Y', 0.06)

    assert low['score'] == 3.0
    assert low['should_trigger'] is False

    assert high['score'] == 8.83
    assert high['should_trigger'] is True
