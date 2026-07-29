// Nested deep enough that the search must hit
// MAX_DATASOURCE_SEARCH_DEPTH and give up, not just fail an immediate match.
export const notADataSource = {
  level1: {
    level2: {
      level3: "still not it",
    },
  },
};
