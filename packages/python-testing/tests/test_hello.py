from python_testing import hello


def test_hello_world() -> None:
    assert hello() == "hello world"
