/**
 * A made-up shed, for the mockup and for local development. Nothing here is
 * real data; the deployed kiosk will load the inventory from the API.
 */
export const sampleInventory = [
  { id: 'bulb-led-a19', name: 'LED bulbs (A19, 60W equivalent)', aliases: ['lightbulb', 'light bulb', 'bulb', 'led'], kind: 'stock', location: { area: 'Shelf 2', spot: 'Top bin, left' }, quantity: 12, unit: 'bulb', lowAt: 4 },
  { id: 'bulb-par38', name: 'Flood bulbs (PAR38, outdoor)', aliases: ['lightbulb', 'light bulb', 'bulb', 'flood', 'floodlight'], kind: 'stock', location: { area: 'Shelf 2', spot: 'Top bin, right' }, quantity: 3, unit: 'bulb', lowAt: 2 },
  { id: 'screws-deck', name: 'Deck screws (3")', aliases: ['screw', 'deck screw', 'wood screw'], kind: 'stock', location: { area: 'Shelf 3', spot: 'Orange bin' }, quantity: 1, unit: 'box', lowAt: 1 },
  { id: 'glue-wood', name: 'Wood glue', aliases: ['glue', 'titebond'], kind: 'stock', location: { area: 'Shelf 3', spot: 'Front' }, quantity: 2, unit: 'bottle' },
  { id: 'tape-duct', name: 'Duct tape', aliases: ['tape', 'gaffer'], kind: 'stock', location: { area: 'Pegboard', spot: 'Hooks, top row' }, quantity: 4, unit: 'roll', lowAt: 1 },
  { id: 'drill-cordless', name: 'Cordless drill', aliases: ['drill', 'driver'], kind: 'tool', location: { area: 'Pegboard', spot: 'Left side' }, quantity: 1, unit: 'drill' },
  { id: 'saw-circular', name: 'Circular saw', aliases: ['saw', 'skil saw', 'skilsaw'], kind: 'tool', location: { area: 'Floor', spot: 'Under the workbench' }, quantity: 1, unit: 'saw' },
  { id: 'ladder-step', name: 'Step ladder (6 ft)', aliases: ['ladder', 'step ladder'], kind: 'tool', location: { area: 'Back wall', spot: 'Hanging, right' }, quantity: 1, unit: 'ladder' },
  { id: 'oil-2stroke', name: '2-stroke oil', aliases: ['oil', 'mower oil', 'chainsaw oil'], kind: 'stock', location: { area: 'Shelf 1', spot: 'Bottom' }, quantity: 6, unit: 'bottle', lowAt: 2 },
  { id: 'gloves-work', name: 'Work gloves', aliases: ['glove', 'gloves'], kind: 'stock', location: { area: 'Shelf 1', spot: 'Basket' }, quantity: 3, unit: 'pair' }
];

/**
 * What the mic "hears" in the mockup, in order, one per tap. They walk through
 * the flow from the design: find something, take some, a question back when
 * the request is ambiguous, borrowing and returning a tool.
 */
export const demoScript = [
  "Where's the cordless drill?",
  "I'm taking the drill",
  'Do I have any deck screws?',
  "I'm taking three lightbulbs",
  'Returning the drill'
];
