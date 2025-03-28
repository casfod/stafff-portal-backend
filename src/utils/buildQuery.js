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

/*

const getAllUsersService = async (queryParams) => {
  // const { search, role, sort, page = 1, limit = 8 } = queryParams;
  const { search, sort, page = 1, limit = 8 } = queryParams;

  // Build the query for filtering
  // Build the query for filtering
  const query = {};
  if (search && search.trim()) {
    const searchTerms = search.trim().split(/\s+/);

    if (searchTerms.length > 0) {
      const searchConditions = searchTerms.map((term) => ({
        $or: [
          { first_name: { $regex: term, $options: "i" } },
          { last_name: { $regex: term, $options: "i" } },
          { email: { $regex: term, $options: "i" } },
          { role: { $regex: term, $options: "i" } },
        ],
      }));

      query.$and = searchConditions;
    }
  }

  // Build the sort object
  let sortQuery = {};
  if (sort) {
    const [field, order] = sort.split(":");
    sortQuery[field] = order === "desc" ? -1 : 1;
  }

  // Pagination
  const skip = (page - 1) * limit;

  // Fetch users with filters, sorting, and pagination
  const users = await User.find(query).sort(sortQuery).skip(skip).limit(limit);

  // Get total count for pagination
  const totalUsers = await User.countDocuments(query);

  return {
    users,
    totalUsers,
    totalPages: Math.ceil(totalUsers / limit),
    currentPage: page,
  };
};
*/
