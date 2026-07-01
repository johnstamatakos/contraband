// Intermediate geographic [lon, lat] waypoints for routes that need visual correction.
// Origin and destination are NOT included — those come from the route data.
// These are purely visual; game state, travel times, and gameplay are unchanged.
export const ROUTE_VISUAL_WAYPOINTS: Record<string, [number, number][]> = {
  // Antimeridian routes: a waypoint in the Pacific forces the line to go westward
  // from LA to the left map edge, then continue from the right map edge toward Asia.
  'route_los_angeles_tokyo':     [[-165, 47]],   // North Pacific near Aleutians
  'route_los_angeles_singapore': [[-160,  5]],   // Central Pacific near equator

  // Land-crossing route: Suez Canal corridor
  // Rotterdam → Mediterranean → Red Sea → Indian Ocean → Shanghai
  'route_rotterdam_shanghai': [[15, 35], [43, 12], [80, 5]],
}
