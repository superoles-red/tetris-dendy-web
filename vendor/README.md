# JSNES 2.1.0

The local distribution is based on jsnes@2.1.0, licensed under Apache 2.0. See [JSNES upstream](https://github.com/bfirsh/jsnes) and [the bundled license](./jsnes-LICENSE.txt).

The marked Mapper148 class in jsnes.js adds the Tengen 800008 cartridge latch to the upstream mapper table. It selects the CHR bank using the low three bits of the bus-conflicted write value. A cartridge with more than one 32 KiB PRG bank also decodes bit 3. See [Mesen's implementation of mapper 148](https://github.com/SourMesen/Mesen2/blob/master/Core/NES/Mappers/Sachen/Sachen_148.h). The upstream source-map reference was removed after the edit.

The cartridge program and artwork in game.nes are separate from JSNES.
