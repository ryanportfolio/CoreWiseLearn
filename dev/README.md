# Dev entries

One HTML page per scene so a scene can be run and tested on its own. Each
page loads `src/dev/<scene>.ts`, which calls `bootApp()` with stub navigation
and pushes the scene. They are served by `npm run dev` at
`/CoreWiseLearn/dev/<scene>.html` and are not part of the production build.

Copy `_template.html`, replace `SCENE` with the scene name, and add the
matching `src/dev/<scene>.ts`.
