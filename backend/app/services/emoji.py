"""Subject emoji suggestion.

1. normalize name/description
2. match multi-word phrases, then word stems (uk + en)
3. pick the best scoring study category -> its emoji
4. optional AI fallback (only on save, never per keystroke)
5. neutral fallback
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

FALLBACK_EMOJI = "📘"


@dataclass(frozen=True)
class Category:
    key: str
    emoji: str
    alternatives: tuple[str, ...]
    phrases: tuple[str, ...] = ()
    stems: tuple[str, ...] = ()


# Stems are prefixes matched against normalized words, so "програмуван" matches all inflections.
CATEGORIES: tuple[Category, ...] = (
    Category("ml", "🧠", ("🤖", "📊"), ("машинне навчання", "машинного навчання", "machine learning", "deep learning", "глибинне навчання", "нейронні мережі", "neural network", "штучний інтелект", "штучного інтелекту", "artificial intelligence", "data science", "computer vision", "комп'ютерний зір"), ("нейромереж", "нейрон", "ml", "ai", "ші", "llm", "nlp")),
    Category("security", "🔐", ("🛡️", "🔑"), ("інформаційна безпека", "захист інформації", "information security"), ("кібер", "cyber", "безпек", "security", "криптограф", "cryptograph", "пентест", "pentest", "шифрув")),
    Category("databases", "🗄️", ("💾", "🧮"), ("бази даних", "баз даних", "база даних", "субд"), ("database", "sql", "postgres", "mysql", "mongo", "субд", "db", "nosql", "реляц")),
    Category("networks", "🌐", ("📡", "🔌"), ("комп'ютерні мережі", "комп'ютерних мереж", "computer networks"), ("мереж", "network", "tcp", "протокол", "protocol", "маршрутиз", "routing", "cisco")),
    Category("architecture_sw", "🏗️", ("🧩", "📐"), ("архітектура пз", "архітектура програмного", "software architecture", "system design", "проєктування систем", "проектування систем", "патерни проєктування", "design patterns"), ("мікросерв", "microserv", "патерн", "pattern")),
    Category("design", "🎨", ("🖌️", "✏️"), ("ui/ux", "ui ux", "людино-машинна взаємодія", "людино машинна взаємодія", "графічний дизайн", "web design", "веб-дизайн"), ("дизайн", "design", "ux", "ui", "figma", "типограф", "typograph", "композиц")),
    Category("web", "🕸️", ("🌍", "💻"), ("веб-технології", "веб технології", "web development", "веб-розробка", "frontend", "backend"), ("веб", "web", "html", "css", "javascript", "react", "фронтенд", "бекенд", "node")),
    Category("mobile", "📱", ("📲",), ("мобільна розробка", "мобільних додатків", "mobile development"), ("android", "ios", "мобільн", "mobile", "flutter", "kotlin", "swift")),
    Category("devops", "⚙️", ("🐳", "🔧"), ("системне адміністрування", "хмарні технології", "cloud computing"), ("devops", "docker", "kubernet", "linux", "хмар", "cloud", "адміністр", "admin", "ci", "cd")),
    Category("os", "🖥️", ("🧰",), ("операційні системи", "операційних систем", "operating systems"), ("операційн", "operating", "windows", "unix")),
    Category("hardware", "🔌", ("🔋", "🧲"), ("комп'ютерна схемотехніка", "архітектура комп'ютера", "computer architecture", "цифрова схемотехніка"), ("схемотех", "електрон", "electron", "мікроконтрол", "microcontroll", "arduino", "embedded", "вбудован", "процесор", "hardware")),
    Category("testing", "🧪", ("✅", "🐞"), ("тестування пз", "тестування програмного", "software testing", "quality assurance"), ("тестуван", "testing", "qa", "якіст")),
    Category("gamedev", "🎮", ("🕹️",), ("розробка ігор", "game development"), ("gamedev", "unity", "unreal", "ігор", "ігров", "game")),
    Category("algorithms", "🧮", ("🔢", "🧩"), ("алгоритми та структури даних", "структури даних", "data structures"), ("алгоритм", "algorithm", "структур", "складніст")),
    Category("programming", "💻", ("⌨️", "🧑‍💻"), ("об'єктно-орієнтоване", "oop", "ооп", "конструювання програмного", "інженерія програмного", "software engineering"), ("програмув", "programm", "python", "java", "c++", "c#", "код", "coding", "розробк", "development", "кпз", "golang", "rust", "typescript")),
    Category("math", "📐", ("➗", "📏"), ("вища математика", "дискретна математика", "лінійна алгебра", "математичний аналіз", "linear algebra", "discrete math"), ("математ", "math", "алгебр", "algebra", "геометр", "geometr", "calculus", "числов", "інтеграл", "диференц")),
    Category("statistics", "📊", ("📈",), ("теорія ймовірностей", "теорія ймовірності", "математична статистика", "аналіз даних", "data analysis"), ("статист", "statist", "ймовірн", "probabil", "аналітик", "analytics")),
    Category("physics", "⚛️", ("🔭", "🧲"), (), ("фізик", "physic", "механік", "mechanic", "оптик", "optic", "термодинам", "квант", "quantum")),
    Category("chemistry", "🧪", ("⚗️", "🧫"), (), ("хімі", "chem", "органічн", "біохім")),
    Category("biology", "🧬", ("🌿", "🦠"), (), ("біолог", "biolog", "генети", "genetic", "анатом", "anatom", "зоолог", "ботані", "мікробіол")),
    Category("medicine", "🩺", ("💊", "❤️"), (), ("медиц", "medic", "фармак", "pharma", "клініч", "здоров", "health", "анатом")),
    Category("ecology", "🌱", ("🌍",), ("охорона праці", "безпека життєдіяльності"), ("еколог", "ecolog", "довкілл", "environment", "природ")),
    Category("geography", "🗺️", ("🌍", "🧭"), (), ("географ", "geograph", "картограф", "геолог", "geolog")),
    Category("astronomy", "🔭", ("🪐", "🌌"), (), ("астроном", "astronom", "космос", "space")),
    Category("philosophy", "📚", ("🏛️", "💭"), (), ("філософ", "philosoph", "логік", "logic", "етик", "ethic")),
    Category("history", "🏛️", ("📜", "⏳"), (), ("історі", "histor", "археолог")),
    Category("literature", "📖", ("✒️", "📝"), ("українська література", "зарубіжна література"), ("літератур", "literat", "поезі", "poetry", "письменн")),
    Category("language", "🗣️", ("🔤", "💬"), ("іноземна мова", "англійська мова", "українська мова", "ділова мова", "english language"), ("мова", "мови", "language", "english", "англійськ", "німецьк", "german", "french", "французьк", "лінгвіст", "linguist", "граматик", "grammar")),
    Category("economics", "📈", ("💹", "💰"), (), ("економ", "econom", "фінанс", "financ", "бухгалт", "account", "банк", "bank", "облік")),
    Category("business", "💼", ("📋", "🤝"), ("управління проєктами", "управління проектами", "project management"), ("менеджм", "manag", "бізнес", "business", "маркетинг", "marketing", "підприємн", "entrepreneur", "управлінн", "scrum", "agile")),
    Category("law", "⚖️", ("📜",), (), ("прав", "law", "юрид", "legal", "конституц", "кримінал")),
    Category("psychology", "🧩", ("💭",), (), ("психолог", "psycholog", "педагог", "pedagog", "соціолог", "sociolog")),
    Category("politics", "🏛️", ("🗳️",), (), ("політ", "politic", "державн", "governance")),
    Category("art", "🖼️", ("🎭",), ("образотворче мистецтво",), ("мистецтв", "art", "живопис", "painting", "театр", "theatre", "культурол")),
    Category("music", "🎵", ("🎹", "🎼"), (), ("музик", "music", "вокал", "сольфедж")),
    Category("sport", "🏃", ("⚽", "🏋️"), ("фізична культура", "фізичне виховання", "physical education"), ("спорт", "sport", "фізкульт", "фітнес", "fitness")),
    Category("engineering", "🛠️", ("⚙️", "🔩"), ("інженерна графіка", "технічна механіка", "нарисна геометрія"), ("інженер", "engineer", "креслен", "drawing", "машинобуд", "будівн", "construct", "автокад", "cad")),
    Category("electrical", "⚡", ("🔋",), ("теоретичні основи електротехніки",), ("електротех", "electric", "енергет", "energy")),
    Category("cooking", "🍳", ("🥗",), (), ("кулінар", "cook", "харчов", "food")),
    Category("graphics", "🖌️", ("🎨",), ("комп'ютерна графіка", "computer graphics"), ("графік", "graphic", "3d", "blender", "анімац", "animation", "моделюван")),
    Category("blockchain", "⛓️", ("🪙",), (), ("блокчейн", "blockchain", "крипто", "crypto", "web3")),
    Category("robotics", "🤖", ("🦾",), (), ("робот", "robot", "автоматиз", "automation", "мехатрон")),
)

_APOSTROPHES = re.compile(r"[’ʼ`´]")
_NON_WORD = re.compile(r"[^\w'+#/ -]+", re.UNICODE)


def normalize(text: str) -> str:
    text = _APOSTROPHES.sub("'", text.lower())
    text = _NON_WORD.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


@dataclass
class Suggestion:
    emoji: str
    source: str  # local | ai | fallback
    category: str | None
    alternatives: list[str]


def _score(text: str, weight: float, scores: dict[str, float]) -> None:
    if not text:
        return
    words = text.replace("/", " ").split()
    for cat in CATEGORIES:
        s = 0.0
        for phrase in cat.phrases:
            if phrase in text:
                s += 3.0
        for word in words:
            for stem in cat.stems:
                # very short stems (ai, ui, ml) must match the whole word
                if (len(stem) <= 3 and word == stem) or (len(stem) > 3 and word.startswith(stem)):
                    s += 1.0
                    break
        if s:
            scores[cat.key] = scores.get(cat.key, 0.0) + s * weight


def suggest_local(name: str, description: str = "") -> Suggestion | None:
    scores: dict[str, float] = {}
    _score(normalize(name), 1.0, scores)
    _score(normalize(description), 0.35, scores)
    if not scores:
        return None
    ranked = sorted(scores, key=lambda k: scores[k], reverse=True)
    by_key = {c.key: c for c in CATEGORIES}
    best = by_key[ranked[0]]
    alternatives: list[str] = list(best.alternatives)
    for key in ranked[1:3]:
        alternatives.append(by_key[key].emoji)
    alternatives = [e for i, e in enumerate(alternatives) if e != best.emoji and e not in alternatives[:i]]
    return Suggestion(best.emoji, "local", best.key, alternatives[:5])


ALLOWED_AI_EMOJI = sorted({c.emoji for c in CATEGORIES} | {e for c in CATEGORIES for e in c.alternatives} | {FALLBACK_EMOJI})


def parse_ai_emoji(text: str) -> str | None:
    try:
        value = json.loads(text.strip().strip("`").removeprefix("json")).get("emoji")
    except (json.JSONDecodeError, AttributeError):
        return None
    return value if value in ALLOWED_AI_EMOJI else None


def fallback() -> Suggestion:
    return Suggestion(FALLBACK_EMOJI, "fallback", None, ["📗", "📙", "📝"])
