const normalizeFiles = (files) =>
  files.map((file) => {
    if (file._doc) return { ...file._doc };
    return file;
  });

function normalizeId(obj, seen = new WeakSet()) {
  if (!obj || typeof obj !== "object") return obj;

  // Check for circular references
  if (seen.has(obj)) return obj;
  seen.add(obj);

  const newObj = { ...obj };

  // Handle ObjectId conversion
  if (newObj._id) {
    newObj.id = newObj._id.toString();
    delete newObj._id;
  }

  // Handle Mongoose special properties
  delete newObj.__v;
  delete newObj.__proto__;

  // Recursive normalization
  Object.keys(newObj).forEach((key) => {
    // Skip special Mongoose properties
    if (key.startsWith("$") || key === "__v") return;

    if (Array.isArray(newObj[key])) {
      newObj[key] = newObj[key].map((item) => normalizeId(item, seen));
    } else if (typeof newObj[key] === "object" && newObj[key] !== null) {
      // Skip Mongoose internal objects
      if (
        !newObj[key].constructor ||
        newObj[key].constructor.name !== "Object"
      ) {
        if (newObj[key]._id) {
          newObj[key] = normalizeId({ ...newObj[key] }, seen);
        }
        return;
      }
      newObj[key] = normalizeId(newObj[key], seen);
    }
  });

  return newObj;
}

module.exports = { normalizeId, normalizeFiles };
