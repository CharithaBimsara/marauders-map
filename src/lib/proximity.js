export const distance = (pointA, pointB) => {
  if (!pointA || !pointB) return Number.POSITIVE_INFINITY;
  return Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
};

export const getClosestUser = (origin, users) => {
  if (!origin || !users?.length) return null;

  return users.reduce((closest, current) => {
    if (!closest) return current;
    const currentDistance = distance(origin, current);
    const closestDistance = distance(origin, closest);
    return currentDistance < closestDistance ? current : closest;
  }, null);
};
