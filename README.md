# Slippi Set Stats
This is a tool used to compute post-set stats from slp files for Melee tournaments. It is intended to be used as part of a production workflow to display post-set stats such as what was done at Mainstage 2019.
## Usage
1. Download executable for your operating system from the Releases tab
2. Move slp files from the same set to the folder containing the executable
3. Run the executable, will generate an output.json file with the stats
## Limitations
1. Cannot know which player played what character
2. If the players change ports during the set, the stats cannot be computed
## Build Instructions
1. Install node 10.15.3
2. Install pkg using `npm i pkg -g`
3. Run `npm build` from the root of the repo