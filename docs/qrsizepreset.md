# Label Size Preset

Part of the [NetBox Labels](https://github.com/N34AY/netbox-labels) plugin.

A **Label Size Preset** is a named label size (in millimeters), offered as a quick pick when
setting a [Label Template](qrtemplate.md)'s canvas size in the visual designer — for common
physical label sizes (e.g. a specific label roll or printer model) you use often.

## Fields

### Name

A unique name for the preset (e.g. `"Niimbot D110 (12x40mm)"`).

### Description

A short description of the preset's purpose (optional).

### Width (mm) / Height (mm)

The label's physical dimensions. These are only ever read when a template's canvas size is set
from this preset in the visual designer — changing a preset afterwards does not retroactively
resize templates that already used it.
