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


def test_rule_engine_dynamic_config_update():
    RuleEngine.update_config({
        'momentumModulus': 8,
        'volumeModulus': 5,
        'momentumWeight': 0.5,
        'volumeWeight': 0.5,
        'triggerThreshold': 5.0
    })
    updated = RuleEngine.evaluate('Y', 0.06)
    assert updated['rules']['config']['momentumModulus'] == 8
    assert updated['rules']['config']['triggerThreshold'] == 5.0
    assert abs(updated['rules']['config']['momentumWeight'] + updated['rules']['config']['volumeWeight'] - 1) < 0.0001


def test_rule_engine_rejects_unknown_config_keys():
    try:
        RuleEngine.update_config({'invalidKey': 1})
        assert False, 'Expected ValueError for unknown key'
    except ValueError as error:
        assert 'Unknown config keys' in str(error)
