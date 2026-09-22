const EDGE_EPSILON = 1;

export function horizontalEdges(element) {
  if (!element) return { canScrollLeft: false, canScrollRight: false };
  const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
  return {
    canScrollLeft: element.scrollLeft > EDGE_EPSILON,
    canScrollRight: element.scrollLeft < maxScrollLeft - EDGE_EPSILON,
  };
}
