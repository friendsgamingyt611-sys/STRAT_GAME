# Shoot Or Shield (SOS)

Version: v2.4

A tactical, survival-based strategic game of risk and resource management.

## Game Mechanics
- Both players start with **0 match points** and **1 unit** of resource.
- Each round, both players commit a move simultaneously:
  - **SHOOT**: Costs 1 unit. Instantly eliminates the opponent if they are **IDLE**.
  - **SHIELD**: Costs 1 unit. Blocks a shot, scoring **+1 match point**.
  - **IDLE**: Free. Punishes a **SHIELD** move by scoring **+1 match point** (wasted shield). Carries your unit count forward.
- **Winner-Takes-All Pot:** The game continues indefinitely until someone is eliminated. When a player dies, the survivor takes the total pot of both players' accumulated match points and adds them to their persistent profile score.
- **Dual Defeat:** If both players shoot simultaneously, both are eliminated, and no profile points are awarded to either.

## Features
- **Learning CPU AI:** A single, adaptive opponent that analyzes your frequency and transition patterns to dynamically counter your moves. No hardcoded personalities.
- **Dual Reset System:** Wipe both your profile progression and the CPU's memory to start fresh.
- **ARM Mobile UI:** Automatic detection of mobile devices and ARM processor architectures, rendering a thumb-friendly layout with docked action controls.

## Development & Stack
- Built with HTML5, CSS Grid/Flexbox, and vanilla ES6 Javascript.
- Audio generated dynamically using the Web Audio API.
