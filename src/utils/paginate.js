const paginate = async (
  model,
  query,
  { page = 1, limit = 8 },
  sortQuery = {},
  populateOptions = null // Make populateOptions optional
) => {
  const skip = (page - 1) * limit;

  // Create the base query
  let baseQuery = model.find(query).sort(sortQuery).skip(skip).limit(limit);

  // Apply populate if options are provided
  if (populateOptions) {
    baseQuery = baseQuery.populate(populateOptions);
  }

  // Execute the query
  const results = await baseQuery.exec();

  // Get the total count of documents matching the query
  const total = await model.countDocuments(query);

  return {
    results,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page,
  };
};

module.exports = paginate;

/*
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


*/
