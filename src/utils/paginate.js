const paginate = async (
  model,
  query,
  { page = 1, limit = 8 },
  sortQuery = {}
) => {
  const skip = (page - 1) * limit;
  const results = await model
    .find(query)
    .sort(sortQuery)
    .skip(skip)
    .limit(limit);
  const total = await model.countDocuments(query);

  return {
    results,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
  };
};

module.exports = paginate;
