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

  // ── US domestic truck routes: keep off water ─────────────────────────────────
  // Houston→Miami straight line cuts through the Gulf of Mexico (midpoint ~27.8°N,
  // -87.8°W). Route via I-10 Gulf Coast → Florida panhandle → peninsula.
  'route_houston_miami':    [[-90.1, 29.9], [-84.3, 30.3], [-81.5, 28.5]],
  'route_miami_houston':    [[-81.5, 28.5], [-84.3, 30.3], [-90.1, 29.9]],

  // NY→Miami straight line goes offshore in the Atlantic by ~lat 33°N (midpoint
  // ~-77.1°W vs coast at -79°W). Route via I-95 / East Coast corridor.
  'route_new_york_miami':   [[-77.9, 34.2], [-81.1, 32.1], [-81.7, 30.3]],
  'route_miami_new_york':   [[-81.7, 30.3], [-81.1, 32.1], [-77.9, 34.2]],

  // ── Atlantic routes: route around South America's eastern bulge ──────────────
  // Without waypoints, a straight line from NY/Miami to São Paulo cuts through the
  // Amazon interior. These waypoints hug the open Atlantic and the northeastern
  // Brazilian coast (Recife ≈ -34.9°W, Cape Branco ≈ -34.8°W at -7°S).
  //
  // Path: Caribbean/Atlantic → open Atlantic east of the bulge → coast of Bahia/ES → SP
  'route_new_york_sao_paulo': [[-45, 18], [-34, -7], [-38, -18], [-42, -23]],
  'route_sao_paulo_new_york': [[-42, -23], [-38, -18], [-34, -7], [-45, 18]],

  'route_miami_sao_paulo':    [[-56, 16], [-34, -7], [-38, -18], [-42, -23]],
  'route_sao_paulo_miami':    [[-42, -23], [-38, -18], [-34, -7], [-56, 16]],

  // ── London / Rotterdam → Dubai: Bay of Biscay → Gibraltar → Mediterranean → Suez → Red Sea ──
  // Straight line cuts through Eastern Europe, Turkey, Iraq — all land.
  'route_london_dubai':    [[-4, 36], [15, 37], [32, 31], [43, 12], [56, 12]],
  'route_dubai_london':    [[56, 12], [43, 12], [32, 31], [15, 37], [-4, 36]],
  'route_rotterdam_dubai': [[-2, 38], [15, 37], [32, 31], [43, 12], [56, 12]],
  'route_dubai_rotterdam': [[56, 12], [43, 12], [32, 31], [15, 37], [-2, 38]],

  // ── Dubai / Mumbai → Singapore: Arabian Sea → south of India → Bay of Bengal → Malacca ──
  // Straight line clips southern India (Cape Comorin ~77°E 8°N). Route goes around.
  'route_dubai_singapore':  [[60, 18], [72, 5], [88, 3], [100, 2]],
  'route_singapore_dubai':  [[100, 2], [88, 3], [72, 5], [60, 18]],
  'route_mumbai_singapore': [[72, 5], [88, 3], [100, 2]],
  'route_singapore_mumbai': [[100, 2], [88, 3], [72, 5]],
}
