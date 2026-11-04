# Best sellers and classics

How `public/systems/<system>/bestsellers/` and the `bestsellers` lists in each `info.json` are
made, from the [LaunchBox Games Database](https://gamesdb.launchbox-app.com/):

```sh
curl -o Metadata.zip https://gamesdb.launchbox-app.com/Metadata.zip
python3 -I scripts/bestsellers/find.py Metadata.zip public/systems found.json
python3 -I scripts/bestsellers/pick.py found.json picks.json
```

`find.py` keeps a system's sales list (in its `info.json`, or `SALES` for systems without one),
or else makes it Classics: titles picked by hand (`CLASSICS`), then the most rated games with a
real picture of their media. `pick.py` chooses each game's picture, the European release where
there is one. Then download each `https://images.launchbox-app.com/<file>`, trim it, fit it in
240 px as WebP into `public/systems/<system>/bestsellers/<rank>.webp`, write the lists into
`info.json` (`"bestsellersBy": "classics"` for Classics), and list every picture in
`CREDITS.md`.
