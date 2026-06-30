require('dotenv/config');

const SPOTS = [
  {
    name: 'Surtainville',
    windguruId: 48400, // Hatainville — même plage, données identiques
    orientation: 270,  // Exposée Ouest
    offshoreDir: [45, 135], // Vent offshore : Est (NE à SE)
  },
  {
    name: 'Sciotot',
    windguruId: 48399,
    orientation: 280,  // Ouest-Nord-Ouest
    offshoreDir: [60, 150],
  },
  {
    name: 'Le Rozel',
    windguruId: 500902,
    orientation: 285,  // Ouest-Nord-Ouest
    offshoreDir: [70, 160],
  },
  {
    name: 'Siouville',
    windguruId: 186,
    orientation: 270,  // Exposée Ouest
    offshoreDir: [45, 135],
  },
  {
    name: 'Vauville',
    windguruId: 48396,
    orientation: 250,  // Anse de Vauville, exposée WSW — capte bien les houles NO
    offshoreDir: [25, 115],
  },
  {
    name: 'Hatainville',
    windguruId: 48400, // Même station que Surtainville (plages voisines)
    orientation: 280,  // Ouest-Nord-Ouest
    offshoreDir: [70, 160],
  },
];

module.exports = { SPOTS };
