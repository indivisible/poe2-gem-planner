#!/usr/bin/env python3

from enum import StrEnum
from pathlib import Path

import lxml.html
from pydantic import BaseModel, TypeAdapter


def print_ancestors(elem):
    stack = []
    while elem is not None:
        stack.insert(0, f"<{elem.tag} {elem.attrib}>")
        elem = elem.getparent()

    for n, x in enumerate(stack):
        print("  " * n + x)


def print_tag(elem):
    print(f"<{elem.tag} {elem.attrib}>")


class GemBasicType(StrEnum):
    RED = "gem_red"
    GREEN = "gem_green"
    BLUE = "gem_blue"
    # hybrid OR item granted
    SPECIAL = "gemitem"


class GemBasicCategory(StrEnum):
    SKILL = "skill"
    SUPPORT = "support"
    META = "meta"
    SPIRIT = "spirit"


class GemBasic(BaseModel):
    id: int
    name: str
    icon_url: str
    level: int
    tags: set[str]
    categories: set[GemBasicCategory]
    type_basic: GemBasicType


class GemIDs(BaseModel):
    gems: dict[str, int] = {}

    def get_gem_id(self, name: str, category: GemBasicCategory) -> int:
        if category == GemBasicCategory.SUPPORT:
            name = "SUPPORT:" + name

        gem_id = self.gems.get(name)
        if gem_id is None:
            if not self.gems:
                gem_id = 1
            else:
                gem_id = max(self.gems.values()) + 1
            self.gems[name] = gem_id
        return gem_id

    @classmethod
    def load(cls, path: Path):
        with path.open() as fp:
            return cls.model_validate_json(fp.read())

    def save(self, path: Path):
        with path.open("w") as fp:
            fp.write(self.model_dump_json())


gem_ids = GemIDs()


def poedb_parse_gem_table(
    category: GemBasicCategory, gems: dict[int, GemBasic], table: lxml.html.HtmlElement
):
    for tr in table.iterfind("tr"):
        name = tr[1][0].text
        id = gem_ids.get_gem_id(name, category)
        if id in gems:
            gems[id].categories.add(category)
            continue

        img = tr[0].find(".//img")
        icon_url = img.attrib["src"]
        # gem_red, gem_green, gem_blue, gemitem
        level = tr[1][0].tail.strip()[1:-1]
        tags_div = tr[1][1]
        tags = set()
        assert "gem_tags" in tags_div.attrib["class"]
        for span in tags_div:
            tags.add(span.text)
        type_ = tr[0][0].attrib["class"]
        gem = GemBasic(
            id=id,
            categories=set([category]),
            name=name,
            icon_url=icon_url,
            level=level,
            tags=tags,
            type_basic=GemBasicType(type_),
        )
        gems[id] = gem


def get_tab_gem_data(
    category: GemBasicCategory, gems: dict[int, GemBasic], tab: lxml.html.HtmlElement
):
    for table in tab.iterfind(".//tbody"):
        poedb_parse_gem_table(category, gems, table)


def parse_gems(path: Path):
    with path.open() as fp:
        html = lxml.html.parse((fp)).getroot()

    # tables = html.find('.//table')

    # for res in html.iterfind('.//tr[@data-tags="Attack AoE Melee Strike Boneshatter"]'):
    #     print_ancestors(res)

    # for res in html.iterfind('.//tr[@data-tags="Support Attack Fire Fire Infusion"]'):
    #     print_ancestors(res)

    gems: dict[int, GemBasic] = {}
    categories = {
        GemBasicCategory.SKILL: "SkillGemsGem",
        GemBasicCategory.SUPPORT: "SupportGemsGem",
        # GemBasicCategory.META: "MetaSkillGemGem",
        GemBasicCategory.SPIRIT: "SpiritGemsGem",
    }
    for name, tab_id in categories.items():
        get_tab_gem_data(name, gems, html.get_element_by_id(tab_id))
    return gems


def load_gem_ids(path: Path):
    global gem_ids
    gem_ids = GemIDs.load(path)
    return gem_ids


def save_gem_ids(path: Path):
    gem_ids.save(path)


def main():
    import argparse

    parser = argparse.ArgumentParser(
        formatter_class=argparse.ArgumentDefaultsHelpFormatter
    )
    parser.add_argument("--gem-html", type=Path, default=Path("poe2db_gem.html"))
    parser.add_argument("--gem-ids", type=Path, default=Path("gem_ids.json"))
    parser.add_argument("--output", type=Path, default=Path("public/poe2gems.json"))

    args = parser.parse_args()

    if args.gem_ids.exists():
        load_gem_ids(args.gem_ids)

    if not args.gem_html.exists():
        print(f"{args.gem_html} not found")
        print("you will need to get this file to parse gem data from, eg:")
        print("wget -Opoe2db_gem.html 'https://poe2db.tw/us/Gem'")
        print()

    gems = parse_gems(args.gem_html)
    print(f"parsed {len(gems)} gems")
    for gem in gems.values():
        if GemBasicCategory.SUPPORT in gem.categories:
            if not len(gem.categories) == 1:
                print("bad support", gem)

    GemDataAdapter = TypeAdapter(list[GemBasic])
    with args.output.open("wb") as fp:
        fp.write(GemDataAdapter.dump_json(list(gems.values())))

    save_gem_ids(args.gem_ids)

    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
