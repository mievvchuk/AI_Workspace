import pytest

from app.services.emoji import FALLBACK_EMOJI, normalize, parse_ai_emoji, suggest_local


@pytest.mark.parametrize(
    ("name", "emoji"),
    [
        ("Машинне навчання", "🧠"),
        ("Філософія", "📚"),
        ("Програмування", "💻"),
        ("Бази даних", "🗄️"),
        ("Кібербезпека", "🔐"),
        ("Математика", "📐"),
        ("Комп’ютерні мережі", "🌐"),
        ("UI/UX дизайн", "🎨"),
        ("Архітектура ПЗ", "🏗️"),
        ("Machine Learning", "🧠"),
        ("Linear Algebra", "📐"),
        ("Основи програмування на Python", "💻"),
        ("Англійська мова за професійним спрямуванням", "🗣️"),
        ("Вища математика", "📐"),
        ("Органічна хімія", "🧪"),
        ("Теорія ймовірностей та математична статистика", "📊"),
    ],
)
def test_known_subjects(name: str, emoji: str) -> None:
    s = suggest_local(name)
    assert s is not None and s.emoji == emoji, (name, s)
    assert emoji not in s.alternatives


def test_description_helps_when_name_is_vague() -> None:
    s = suggest_local("Курс 3", "Вивчаємо SQL, PostgreSQL і нормалізацію")
    assert s is not None and s.emoji == "🗄️"


def test_unknown_returns_none() -> None:
    assert suggest_local("Ббббб") is None


def test_normalize_apostrophes() -> None:
    assert normalize("Комп’ютерні  Мережі!") == "комп'ютерні мережі"


def test_parse_ai_emoji_only_allows_known() -> None:
    assert parse_ai_emoji('{"emoji": "🧠"}') == "🧠"
    assert parse_ai_emoji('{"emoji": "💩"}') is None
    assert parse_ai_emoji("not json") is None
    assert FALLBACK_EMOJI == "📘"
