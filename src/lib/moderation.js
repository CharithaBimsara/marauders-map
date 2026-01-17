const BAD_WORDS = ["fuck", "ass", "kukku", "hukanwna", "kimba", "fun", "sapa", "paiya", "polla", "than", "than deka", "pussy", "dick", "cock","nude", "show", "sex", "suck","boobs", "tits", "breast", "cum", "ejaculate", "masturbate", "horny","bastard", "bollocks", "bugger", "crap", "damn", "git", "prick","whore", "slut", "darn", "douche","bollock","bhenchod","madarchod","randi","chutiya","chutiyapa","behen ke lode","lund","loda","gandu","gand","harami","jhaat","jhaat ke patte","haraamzaade","lund ke patte","lund","lodu","lodu ke patte"];

const normalizeMessage = (message) => {
  return message
    .toLowerCase()
    .replace(/[\s\W_]+/g, "");
};

const extractDigits = (message) => {
  return message.replace(/\D+/g, "");
};

export const containsBannedContent = (message) => {
  if (!message) return false;

  const normalized = normalizeMessage(message);
  const digits = extractDigits(normalized);

  if (digits.length >= 8) return true;

  return BAD_WORDS.some((word) => normalized.includes(word));
};
