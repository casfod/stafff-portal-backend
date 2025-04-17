const buildSortQuery = (sort) => {
  let sortQuery = { createdAt: -1 }; // Default: sort by createdAt in descending order (newest first)

  if (sort) {
    const [field, order] = sort.split(":");
    sortQuery = {}; // Reset the default if sort is provided
    sortQuery[field] = order === "desc" ? -1 : 1;
  }

  return sortQuery;
};

module.exports = buildSortQuery;
