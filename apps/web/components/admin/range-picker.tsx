import Link from "next/link";
import { FilterBar, filterInputClasses } from "./list-bits";
import { rangeHref, rangePresets, type ReportRange } from "./range";

/**
 * Today / 7 days / 30 days links, plus two date boxes for any other range. Everything is in the
 * address (?from=&to=), so a report can be bookmarked or shared. With no range in the address
 * the API shows the last 30 days, so that preset is marked as the current one.
 */
export function RangePicker({ basePath, range }: { basePath: string; range: ReportRange }) {
  const presets = rangePresets(new Date());
  const thirtyDays = presets[2];

  return (
    <div className="flex flex-wrap items-end gap-3">
      <nav aria-label="Range" className="flex gap-2">
        {presets.map((preset) => {
          let current = preset.from === range.from && preset.to === range.to;
          if (range.from === undefined && range.to === undefined && preset === thirtyDays) {
            current = true;
          }
          let classes = "min-h-11 rounded-full border-2 border-zinc-200 px-4 py-2 font-bold";
          let ariaCurrent: "page" | undefined = undefined;
          if (current) {
            classes =
              "bg-ink border-ink min-h-11 rounded-full border-2 px-4 py-2 font-bold text-white";
            ariaCurrent = "page";
          }
          return (
            <Link
              key={preset.label}
              href={rangeHref(basePath, preset.from, preset.to)}
              aria-current={ariaCurrent}
              className={classes}
            >
              {preset.label}
            </Link>
          );
        })}
      </nav>
      <FilterBar>
        <label className="flex flex-col text-sm font-bold">
          From
          <input type="date" name="from" defaultValue={range.from} className={filterInputClasses} />
        </label>
        <label className="flex flex-col text-sm font-bold">
          To
          <input type="date" name="to" defaultValue={range.to} className={filterInputClasses} />
        </label>
      </FilterBar>
    </div>
  );
}
