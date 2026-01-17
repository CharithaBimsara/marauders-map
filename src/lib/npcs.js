/**
 * NPC logic and dialogue system for the Marauder's Map
 */

// Walking speeds - very slow, natural pace
const WALK_SPEED = 0.015; // Base walking speed (much slower)
const WANDER_RADIUS = 150; // How far NPCs can wander from home
const PAUSE_CHANCE = 0.002; // Chance to pause each frame
const DIRECTION_CHANGE_CHANCE = 0.005; // Chance to change direction randomly

// Scary NPC definitions - patrol and hunt students during curfew
export const SCARY_NPC_DEFINITIONS = [
  {
    id: "snape",
    name: "Severus Snape",
    title: "Potions Master",
    emoji: "🧙‍♂️",
    isScary: true,
    dialogues: [
      "What are you doing out of bed, Potter?!",
      "Detention! My office, tomorrow night!",
      "Obviously fame isn't everything, is it?",
      "I can teach you how to bewitch the mind and ensnare the senses...",
      "Fifty points from your house!",
      "You dare wander the corridors at this hour?"
    ],
    homePosition: { x: 280, y: 450 },
    speed: WALK_SPEED * 1.2, // Faster than regular NPCs
    wanderRadius: 250 // Patrols larger area
  },
  {
    id: "filch_scary",
    name: "Argus Filch",
    title: "Caretaker",
    emoji: "👤",
    isScary: true,
    dialogues: [
      "STUDENTS OUT OF BED! STUDENTS IN THE CORRIDORS!",
      "Mrs. Norris spotted you... You're in big trouble now!",
      "I'll have you strung up by your thumbs!",
      "In my office... NOW!",
      "Sneaking around at night, are we?",
      "I've got you now, you little brat!"
    ],
    homePosition: { x: 500, y: 380 },
    speed: WALK_SPEED * 1.0,
    wanderRadius: 300 // Patrols everywhere
  },
  {
    id: "dementor",
    name: "Dementor",
    title: "Dark Creature",
    emoji: "👻",
    isScary: true,
    dialogues: [
      "*A bone-chilling cold surrounds you...*",
      "*Your happiest memories begin to fade...*",
      "*The temperature drops... You can see your breath...*",
      "*A rattling, sucking sound fills the air...*",
      "*You feel all hope draining away...*"
    ],
    homePosition: { x: 750, y: 450 },
    speed: WALK_SPEED * 0.8, // Slow but terrifying
    wanderRadius: 200,
    ghostly: true // Special rendering
  },
  {
    id: "peeves_scary",
    name: "Peeves",
    title: "Poltergeist",
    emoji: "🎭",
    isScary: true,
    dialogues: [
      "OOOOOH! Ickle student out of bed!",
      "STUDENT ALERT! STUDENT ALERT!",
      "Naughty naughty, you'll get CAUGHTY!",
      "Should I call Filch? Or should I call SNAPE?!",
      "Potty wee students wandering at night!",
      "WEEEEEE! Catch the student, catch catch catch!"
    ],
    homePosition: { x: 600, y: 250 },
    speed: WALK_SPEED * 1.5, // Fast and erratic
    wanderRadius: 350,
    erratic: true
  }
];

export const NPC_DEFINITIONS = [
  {
    id: "dumbledore",
    name: "Albus Dumbledore",
    title: "Headmaster",
    dialogues: [
      "Ah, lemon drops!",
      "It does not do to dwell on dreams and forget to live.",
      "Happiness can be found in the darkest of times...",
      "Words are our most inexhaustible source of magic.",
      "It is our choices that show what we truly are."
    ],
    homePosition: { x: 600, y: 250 },
    speed: WALK_SPEED * 0.8 // Dumbledore walks slowly, contemplatively
  },
  {
    id: "mcgonagall",
    name: "Minerva McGonagall",
    title: "Deputy Headmistress",
    dialogues: [
      "Five points from your house!",
      "I should have made myself clearer.",
      "We teachers are rather good at magic, you know.",
      "Is it true you shouted at Professor Umbridge?",
      "Have a biscuit, Potter."
    ],
    homePosition: { x: 350, y: 450 },
    speed: WALK_SPEED * 1.0 // Purposeful but measured pace
  },
  {
    id: "peeves",
    name: "Peeves",
    title: "Poltergeist",
    dialogues: [
      "Oooh, ickle firsties!",
      "STUDENTS OUT OF BED!",
      "Naughty, naughty, you'll get caughty!",
      "Potty wee Potter!",
      "Oh, most think he's barking, the potty wee lad!"
    ],
    homePosition: { x: 500, y: 380 },
    speed: WALK_SPEED * 1.5, // Slightly faster, but still walking
    erratic: true
  },
  {
    id: "filch",
    name: "Argus Filch",
    title: "Caretaker",
    dialogues: [
      "Students out of bed!",
      "I'll have you in detention!",
      "Mrs. Norris will find you...",
      "In the old days, they let us hang students by their ankles.",
      "Running in the corridors!"
    ],
    homePosition: { x: 220, y: 350 },
    speed: WALK_SPEED * 0.9 // Shuffling patrol
  },
  {
    id: "hagrid",
    name: "Rubeus Hagrid",
    title: "Keeper of Keys",
    dialogues: [
      "I should not have said that.",
      "Yer a wizard, Harry!",
      "What's comin' will come, an' we'll meet it when it does.",
      "There's no Hogwarts without you, Hagrid.",
      "I am what I am, an' I'm not ashamed."
    ],
    homePosition: { x: 850, y: 500 },
    speed: WALK_SPEED * 0.7 // Big slow steps
  }
];

export const createNPCState = (definition) => {
  // Start at home position with random target nearby
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * WANDER_RADIUS * 0.5;
  return {
    ...definition,
    x: definition.homePosition.x,
    y: definition.homePosition.y,
    targetX: definition.homePosition.x + Math.cos(angle) * dist,
    targetY: definition.homePosition.y + Math.sin(angle) * dist,
    isPaused: false,
    pauseUntil: 0,
    currentDialogue: null,
    lastDialogueTime: 0
  };
};

export const initializeNPCs = () => {
  return NPC_DEFINITIONS.map(createNPCState);
};

// Initialize scary NPCs for curfew mode
export const initializeScaryNPCs = () => {
  return SCARY_NPC_DEFINITIONS.map((def) => {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (def.wanderRadius || WANDER_RADIUS) * 0.5;
    return {
      ...def,
      x: def.homePosition.x,
      y: def.homePosition.y,
      targetX: def.homePosition.x + Math.cos(angle) * dist,
      targetY: def.homePosition.y + Math.sin(angle) * dist,
      isPaused: false,
      pauseUntil: 0,
      currentDialogue: null,
      lastDialogueTime: 0,
      lastEncounterTime: 0
    };
  });
};

// Pick a new random target within wander radius of home
const pickNewTarget = (npc) => {
  const angle = Math.random() * Math.PI * 2;
  const radius = npc.wanderRadius || WANDER_RADIUS;
  const dist = Math.random() * radius;
  return {
    targetX: npc.homePosition.x + Math.cos(angle) * dist,
    targetY: npc.homePosition.y + Math.sin(angle) * dist
  };
};

export const updateNPCPosition = (npc, deltaTime) => {
  const now = Date.now();
  
  // Check if NPC is paused (standing still, looking around)
  if (npc.isPaused) {
    if (now < npc.pauseUntil) {
      return npc; // Still paused, don't move
    }
    // Pause ended, pick new direction and resume
    return {
      ...npc,
      ...pickNewTarget(npc),
      isPaused: false
    };
  }
  
  // Random chance to pause and stand still
  if (Math.random() < PAUSE_CHANCE) {
    const pauseDuration = 2000 + Math.random() * 4000; // 2-6 seconds pause
    return {
      ...npc,
      isPaused: true,
      pauseUntil: now + pauseDuration
    };
  }
  
  // Random chance to change direction (wander randomly)
  if (Math.random() < DIRECTION_CHANGE_CHANCE) {
    return {
      ...npc,
      ...pickNewTarget(npc)
    };
  }
  
  // Move toward current target
  const dx = npc.targetX - npc.x;
  const dy = npc.targetY - npc.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  // Reached target? Pick new random target
  if (distance < 5) {
    return {
      ...npc,
      ...pickNewTarget(npc)
    };
  }
  
  // Calculate movement - slow walking pace
  const moveSpeed = npc.speed * deltaTime;
  const ratio = Math.min(moveSpeed / distance, 1);
  
  // Add slight wobble for natural walking (very subtle)
  const wobble = npc.erratic ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.1;
  
  return {
    ...npc,
    x: npc.x + dx * ratio + wobble,
    y: npc.y + dy * ratio + wobble
  };
};

export const getNPCDialogue = (npc) => {
  const randomIndex = Math.floor(Math.random() * npc.dialogues.length);
  return npc.dialogues[randomIndex];
};

export const checkNPCProximity = (userPosition, npc, threshold = 100) => {
  const dx = userPosition.x - npc.x;
  const dy = userPosition.y - npc.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance <= threshold;
};

export const serializeNPCsForFirebase = (npcs) => {
  return npcs.reduce((acc, npc) => {
    acc[npc.id] = {
      x: npc.x,
      y: npc.y,
      targetX: npc.targetX,
      targetY: npc.targetY,
      isPaused: npc.isPaused,
      pauseUntil: npc.pauseUntil,
      updatedAt: Date.now()
    };
    return acc;
  }, {});
};

export const mergeNPCsFromFirebase = (localNPCs, firebaseData) => {
  if (!firebaseData) return localNPCs;

  return localNPCs.map((npc) => {
    const remoteData = firebaseData[npc.id];
    if (!remoteData) return npc;

    // Only update if remote data is newer
    if (remoteData.updatedAt > (npc.updatedAt || 0)) {
      return {
        ...npc,
        x: remoteData.x,
        y: remoteData.y,
        targetX: remoteData.targetX,
        targetY: remoteData.targetY,
        isPaused: remoteData.isPaused,
        pauseUntil: remoteData.pauseUntil,
        updatedAt: remoteData.updatedAt
      };
    }
    return npc;
  });
};
