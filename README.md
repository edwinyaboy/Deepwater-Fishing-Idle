<div align="center">

<img src="assets/icons/screenshot.png" alt="Deepwater: Fishing Idle" width="1024" />

<h1>Deepwater: Fishing Idle</h1>

<p><strong>A pixel-art idle fishing game about catching fish, building your collection, and seeing how deep you can go.</strong></p>

<p>
  <a href="https://github.com/edwinyaboy/Deepwater-Fishing-Idle/releases/latest">
    <img src="https://img.shields.io/github/v/release/edwinyaboy/Deepwater-Fishing-Idle?display_name=tag&sort=semver" alt="Latest Release" />
  </a>
  <a href="https://github.com/edwinyaboy/Deepwater-Fishing-Idle">
    <img src="https://img.shields.io/github/repo-size/edwinyaboy/Deepwater-Fishing-Idle" alt="Repository Size" />
  </a>
  <a href="https://github.com/edwinyaboy/Deepwater-Fishing-Idle/commits/main">
    <img src="https://img.shields.io/github/last-commit/edwinyaboy/Deepwater-Fishing-Idle" alt="Last Commit" />
  </a>
</p>

<p>
  <a href="https://edwinyaboy.github.io/Deepwater-Fishing-Idle/">Play Now</a> ·
  <a href="https://github.com/edwinyaboy/Deepwater-Fishing-Idle/releases/latest">Download</a> ·
  <a href="#get-started">Get started</a> ·
  <a href="#features">Features</a> ·
  <a href="#releases">Releases</a> ·
  <a href="#license">License</a>
</p>

</div>

## Fish. Upgrade. Repeat.

Deepwater combines the progression of an idle game with a hands-on fishing loop. Every cast gives you another chance at a better catch, while upgrades gradually push your fishing setup further.

## Features

| Fishing                 | Progression        | Collection           |
| :---------------------- | :----------------- | :------------------- |
| Fast reel-based fishing | Fishing upgrades   | Fish index           |
| Auto Fish               | Skill tree         | Rare catches         |
| Triple Hook             | Rebirths           | Achievements         |
| Rare catch effects      | Mastery            | Catch statistics     |
| Offline progression     | Potions and boosts | Long-term collection |

### Fishing

* Fast visual reel and catch system
* Chance-based fish rolls
* Dynamic fishing speed upgrades
* Triple Hook multi-catch fishing
* Auto Fish for hands-off progression
* Rare catch effects and sounds

### Progression

* Fishing speed, luck and storage upgrades
* Skill tree
* Rebirths
* Mastery progression
* Potions and temporary boosts
* Treasure chests
* Pearls and other progression currencies

### Collection

* Fish index and discovery tracking
* Rare fish and valuable catches
* Catch statistics
* Achievements and milestones
* Long-term collection progression

### Offline Progression

Leave the game running in the background and come back to your catches later.

Deepwater tracks offline time and calculates your missed fishing progress when you return, with a defined offline cap.

## Get started

Deepwater runs directly in a modern web browser.

The easiest way to play is through the [live browser version](https://edwinyaboy.github.io/Deepwater-Fishing-Idle/).

You can also download the latest Windows or Android release from [Releases](https://github.com/edwinyaboy/Deepwater-Fishing-Idle/releases/latest).

### Run from source

The browser version does not require a frontend framework, bundler, or build step. It does need to be served through a local HTTP server rather than opened directly with `file://`.

Clone the repository:

```text
git clone https://github.com/edwinyaboy/Deepwater-Fishing-Idle.git
cd Deepwater-Fishing-Idle
```

If Python is installed, start a local server with:

```text
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

The relevant browser game files are:

```text
Deepwater-Fishing-Idle/
├── index.html
├── js/
├── css/
└── assets/
```

## Android

Deepwater is also available as a native Android build packaged with Capacitor.

Download the latest APK from [Releases](https://github.com/edwinyaboy/Deepwater-Fishing-Idle/releases/latest).

## Windows

The Windows release packages the complete game into a single executable.

Requires:

* Windows 10/11 (64-bit)
* .NET 9 Desktop Runtime
* Microsoft Edge WebView2 Runtime

Download the latest Windows build from [Releases](https://github.com/edwinyaboy/Deepwater-Fishing-Idle/releases/latest).

## Releases

| Platform | Download                                                            |
| :------- | :------------------------------------------------------------------ |
| Browser  | [Play online](https://edwinyaboy.github.io/Deepwater-Fishing-Idle/) |
| Android  | APK                                                                 |
| Windows  | AIO `.EXE`                                                          |

The latest builds and release assets are available on the [Releases](https://github.com/edwinyaboy/Deepwater-Fishing-Idle/releases) page.

## Save Data

Player progression is stored locally in the browser.

Save data includes:

* Coins and Pearls
* Fishing upgrades
* Skills
* Inventory
* Fish discoveries
* Achievements
* Potions
* Chests
* Relics
* Mastery
* Rebirth progression

Save data is versioned so existing saves can be migrated when the game changes.

## Technology

Deepwater is built with a deliberately lightweight web stack.

| Technology    | Use                            |
| :------------ | :----------------------------- |
| HTML          | Game interface                 |
| CSS           | Layout and visual presentation |
| JavaScript    | Game systems and progression   |
| Local Storage | Persistent player saves        |
| Capacitor     | Android packaging              |

The browser version does not require a framework, bundler, or external backend.

## Development

The public repository contains the playable game source.

Development tools, test infrastructure, Android build configuration, release signing material, and other internal development files are kept outside the public game source.

## Credits

Created and developed as **Deepwater: Fishing Idle**.

Third-party assets, libraries, fonts, and other components remain subject to their respective licenses and terms.

## License

**Copyright 2026 Deepwater Fishing Idle. All rights reserved.**

This repository is publicly available for inspection.

No license is granted to copy, modify, redistribute, sublicense, sell, publish, repackage, or create derivative versions of Deepwater: Fishing Idle, its source code, or its included assets without prior written permission from the copyright holder.

This includes, but is not limited to:

* Releasing the game as your own
* Republishing the game or modified versions
* Distributing the source code elsewhere
* Selling or commercially distributing the project
* Uploading the project to another store or distribution platform
* Creating and publishing derivative games using the project
* Removing or altering copyright notices

Public availability of this repository does not grant permission to reuse or redistribute the project.

Third-party assets and libraries remain subject to their respective licenses and terms.

For licensing, collaboration, or other permissions, contact the copyright holder.

<div align="center">

**Deepwater: Fishing Idle**

*Cast deeper. Catch rarer. Keep fishing.*

</div>
