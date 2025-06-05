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
    if (Array.isArray(populateOptions)) {
      // If populateOptions is an array, apply each populate
      populateOptions.forEach((option) => {
        baseQuery = baseQuery.populate(option);
      });
    } else {
      // If populateOptions is a single object, apply it directly
      baseQuery = baseQuery.populate(populateOptions);
    }
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
