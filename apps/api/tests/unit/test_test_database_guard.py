import pytest

from tests.helpers import is_safe_test_database_name


@pytest.mark.parametrize("name", ["statesync_test", "app_test", "x1_test"])
def test_accepts_names_ending_in_test(name: str) -> None:
    assert is_safe_test_database_name(name)


@pytest.mark.parametrize(
    "name",
    [
        "statesync",  # the development database
        "contest_prod",  # merely contains "test"
        "test_statesync",  # prefix, not suffix
        "statesync_test_backup",
        "_test",  # no identifier before the suffix
        "",
        'x"; DROP DATABASE y; --_test',  # injection attempt
        "app-test",
    ],
)
def test_rejects_everything_else(name: str) -> None:
    assert not is_safe_test_database_name(name)
