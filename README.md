# Kasse-Boom! 💥

Et 3D side-scroller-skydespil til browseren, lavet til de mindste.
Ingen fjender – bare kasser, der skal skydes i stumper og stykker!

## Sådan spiller man
- Figuren **går automatisk fremad** og stopper, når der står kasser i vejen.
- To store knapper i bunden affyrer **våben 1** og **våben 2** (hold nede for at skyde løbende).
  På computer: `Z`/`Mellemrum` = våben 1, `X` = våben 2.
- Alle skud går fremad. Kasserne vælter, når kasserne under dem forsvinder. Pas på **TNT**-kasser 🧨.
- Ødelagte kasser taber **jernfirkanter**, som bruges til at opgradere våben mellem banerne.
- Undervejs står der nye våben på en piedestal. Figuren stopper – **tryk på våbnet**, og tryk så på den af de to knapper, du vil bytte ud.
- Alt gemmes automatisk i browseren (localStorage).

## De 8 våben
🔫 Blaster · 💣 Bombehandske · 🔥 Flammekaster · ⚙️ Savklinger · ⚡ Lynkanon · 🚀 Raketbatteri · 🔮 Diskokugle · 🎉 Konfettikanon

## Kør lokalt
```bash
npm install
npm run dev      # udvikling
npm run build    # produktionsbuild i dist/
```
Teknik: [Three.js](https://threejs.org) + [Vite](https://vitejs.dev). Alle modeller og lyde er genereret i kode.
