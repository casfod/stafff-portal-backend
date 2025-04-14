const buildQuery = (searchTerms, searchFields) => {
  const query = {};
  if (searchTerms && searchTerms.length > 0) {
    const searchConditions = searchTerms.map((term) => ({
      $or: searchFields.map((field) => ({
        [field]: { $regex: term, $options: "i" },
      })),
    }));
    query.$and = searchConditions;
  }
  return query;
};

module.exports = buildQuery;
