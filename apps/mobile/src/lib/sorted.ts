export function sortedCopy<T>(
  items: ReadonlyArray<T>,
  compare: (left: T, right: T) => number,
): Array<T> {
  if (typeof items.toSorted === "function") {
    return items.toSorted(compare);
  }

  // eslint-disable-next-line unicorn/no-array-sort
  return [...items].sort(compare);
}
