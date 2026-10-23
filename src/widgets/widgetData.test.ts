import test from "node:test";
import assert from "node:assert/strict";
import { shallow } from "zustand/shallow";
import { EMPTY_WIDGET_DATA, selectWidgetData } from "./widgetData.ts";

test("media updates leave other widget selections shallowly equal", () => {
  const before = EMPTY_WIDGET_DATA;
  const after = { ...before, media: { sessions: [], current: "new" } };
  assert.equal(shallow(selectWidgetData("media", before), selectWidgetData("media", after)), false);
  for (const kind of ["github-mine", "network", "calendar", "weather", "clock"] as const) {
    assert.ok(shallow(selectWidgetData(kind, before), selectWidgetData(kind, after)));
  }
});

test("weather configuration changes update weather but not other widgets", () => {
  const after = { ...EMPTY_WIDGET_DATA, weatherConfigured: true };
  assert.equal(selectWidgetData("weather", after).weatherConfigured, true);
  assert.ok(shallow(selectWidgetData("battery", EMPTY_WIDGET_DATA), selectWidgetData("battery", after)));
});
