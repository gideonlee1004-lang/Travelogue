# Travelogue: AeroAPI-powered Add Flight

Only the Add Flight workflow and its related flight-day status display have changed.
Other itinerary, trip, login, collaboration, mapping and place features remain in place.

## One required configuration step

1. Obtain a FlightAware **AeroAPI v4** key (not a FlightXML v2 key).
2. In **Vercel → Your Travelogue project → Settings → Environment Variables**, add:

   `AEROAPI_KEY` = **your FlightAware AeroAPI key**

   Enable it for Production (and Preview/Development if you use them). **Do not put it in Vite variables** (`VITE_` prefix) or commit it in source code.
3. Redeploy Travelogue so the serverless `/api/flights` route receives that variable.
4. Sign in, open a trip, click **Add Flight**, enter a flight number such as `SQ638` and choose **departure date**, then click **Find scheduled flight**. If multiple matching schedules exist, select the correct service. Optionally enter **Seat number** and **Booking reference**, and choose **Add Flight**.

The chosen flight is assigned automatically to the corresponding date within the trip. If the departure date is outside the trip, extend the trip dates first.

## FlightAware data and updates

- **Far in advance:** FlightAware's `/schedules/{date_start}/{date_end}` endpoint returns published airline schedules up to ~1 year in advance. Travelogue fills the origin/destination, departure and arrival airport-local times, and flight map positions using airport metadata. It does not guess unannounced terminals or gates.
- **Near departure:** FlightAware's `/flights/{ident}` endpoint is checked for real-time gate/terminal, estimate and status. It becomes useful approximately within two days of departure; sometimes its fields remain absent because the airline/airport has not reported them.
- **On flight day:** With Travelogue **open**, gate/terminal/status data is checked automatically on opening/returning to the tab and about every 10 minutes thereafter. Tap **Refresh** beside a saved flight to check immediately.
- If the departure gate changes from one known gate to a different one, an amber notice appears. An empty field in FlightAware is shown as **Not published/Not assigned**, not fabricated.
- This is **in-app polling, not push notifications or background updates when the browser is closed**. Always confirm terminal/gate on airline and airport displays.
- Existing manually added flights are preserved, but they do not have the AeroAPI identifiers needed for automatic updates. Re-add such flights with the new flight lookup to enable syncing.
- AeroAPI is a paid API; schedule queries, flight detail lookups, and airport metadata queries may generate usage charges. Refreshing on flight day requires an active internet connection.

Run `npm test` to execute unit tests (including flight lookups and mocked gate changes). Run `npm run build` after installing dependencies with `npm ci`.
