# Thread Namer

Find the thread by what it does. Automatic, configurable thread titles for BB.

A plugin for [BB](https://getbb.app).

## Highlights

- **Automatic titles.** Name threads after the first reply or keep generated titles up to date.
- **Your model choice.** Configure a naming agent, length, instructions, and timeout.
- **Respect manual edits.** Automatic naming leaves titles you wrote yourself alone.
- **On demand.** Regenerate from the CLI with `bb thread-namer rename`.

## Install

```sh
bb plugin install https://github.com/dillionverma/bb-thread-namer
```

Requires BB 0.43+ and a compatible Plugin SDK (see `package.json`).

## Use

Configure **Thread Namer** in plugin settings. Double-click a thread title for manual editing. There is no separate toolbar rename button.

## Designed to stay responsive

Naming uses a small model by default and falls back across available providers when necessary. Naming calls consume provider usage.

## Development

```sh
npm ci
npm run typecheck
npm test
bb plugin build .
```

Focused fixes and reproducible bug reports are welcome. Include BB version, platform, and steps to reproduce.

## Compatibility

The repository and display name are independent of BB’s persistent plugin identity. The internal ID remains `thread-namer` so existing settings, stored data, CLI commands, and integrations continue to work.

## The Ultra suite

Built for getting work done across multiple threads, agents, and projects. Install only the pieces you need.

- [Ultra Sidebar](https://github.com/dillionverma/bb-plugin-ultra-sidebar) — Organize parallel work.
- [Ultra Launcher](https://github.com/dillionverma/bb-plugin-ultra-launcher) — Start the next run.
- [Ultra Topbar](https://github.com/dillionverma/bb-plugin-ultra-topbar) — Turn threads into pull requests.
- [Linear Panel](https://github.com/dillionverma/bb-plugin-linear-panel) — Keep issues beside execution.
- [Usage Window](https://github.com/dillionverma/bb-plugin-usage-window) — Keep account capacity in view.

## Credits

Based on [Thread Namer by suiramdev](https://github.com/suiramdev/bb-plugin-thread-namer). Original MIT notice is preserved in LICENSE.

## License

MIT. See [LICENSE](LICENSE).
