export const normalizeText = (input: string): string => {
  return input
    .toLowerCase()
    .replace(/[^\w\s$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

export const normalizeLocation = (location: string): string => {
  const lower = location.toLowerCase().trim();
  // Map common variations to canonical forms
  const mappings: Record<string, string> = {
    "sf": "san francisco",
    "san fran": "san francisco",
    "bay area": "san francisco", // specific decision for this context
    "nyc": "new york",
    "ny": "new york",
    "la": "los angeles",
    // Add more as needed
  };
  return mappings[lower] || lower;
};

export const normalizeTitle = (title: string): string => {
  const lower = title.toLowerCase().trim();
  const mappings: Record<string, string> = {
    "cto": "chief technology officer",
    "ceo": "chief executive officer",
    "coo": "chief operating officer",
    "cfo": "chief financial officer",
    "vp": "vice president",
    "swe": "software engineer",
    "dev": "software engineer",
    "developer": "software engineer",
    "software developer": "software engineer",
    "software dev": "software engineer",
    "backend engineer": "software engineer",
    "backend developer": "software engineer",
    "backend dev": "software engineer",
    "frontend engineer": "software engineer",
    "frontend developer": "software engineer",
    "frontend dev": "software engineer",
    "eng": "engineer",
    "senior engineer": "senior software engineer",
  };
  
  // Partial replacements for compound titles
  let normalized = lower;
  for (const [key, value] of Object.entries(mappings)) {
      // careful not to replace parts of words blindly, but for titles it's often okay to replace full tokens
      // "senior dev" -> "senior software engineer"
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      normalized = normalized.replace(regex, value);
  }
  
  return normalized;
};

export const normalizeFundingStage = (stage: string): string => {
  const lower = stage.toLowerCase().trim()
      .replace(/[\-_]/g, " ") // normalize separators
      .replace(/\bround\b/g, "") // remove "round"
      .trim();

  const mappings: Record<string, string> = {
    "seed": "seed",
    "pre seed": "pre-seed",
    "series a": "series a",
    "series b": "series b",
    "series c": "series c",
    "ipo": "ipo",
    "public": "ipo",
    "early stage": "seed", // broad mapping
    "late stage": "series c", // broad mapping
  };

  return mappings[lower] || lower;
};

export const levenshteinDistance = (a: string, b: string, maxDistance: number = 10): number => {
  // Early exit for exact matches
  if (a === b) return 0;
  
  // Early exit if length difference exceeds max distance
  const lenDiff = Math.abs(a.length - b.length);
  if (lenDiff > maxDistance) return maxDistance + 1;
  
  // Use only two rows instead of full matrix for O(min(m,n)) space
  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  
  let previousRow: number[] = [];
  for (let i = 0; i <= shorter.length; i++) {
    previousRow[i] = i;
  }
  
  for (let i = 1; i <= longer.length; i++) {
    const currentRow: number[] = [i];
    let minInRow = i;
    
    for (let j = 1; j <= shorter.length; j++) {
      const cost = longer.charAt(i - 1) === shorter.charAt(j - 1) ? 0 : 1;
      const insert = previousRow[j] + 1;
      const delete_ = currentRow[j - 1] + 1;
      const replace = previousRow[j - 1] + cost;
      
      currentRow[j] = Math.min(insert, delete_, replace);
      minInRow = Math.min(minInRow, currentRow[j]);
    }
    
    // Early termination if entire row exceeds max distance
    if (minInRow > maxDistance) return maxDistance + 1;
    
    previousRow = currentRow;
  }
  
  return previousRow[shorter.length];
};
