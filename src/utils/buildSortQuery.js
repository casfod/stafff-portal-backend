const buildSortQuery = (sort) => {
  let sortQuery = {};
  if (sort) {
    const [field, order] = sort.split(":");
    sortQuery[field] = order === "desc" ? -1 : 1;
  }
  return sortQuery;
};

module.exports = buildSortQuery;
