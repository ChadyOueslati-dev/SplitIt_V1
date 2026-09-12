// Shared by anything that accepts an uploaded image as a data URI (user avatars, group
// photos): the client resizes to a small square before upload, so this just checks the
// shape and a generous size ceiling — a backstop against a client that skips the resize,
// not the primary size control (each schema's own maxlength is the hard cap).
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/;
const MAX_IMAGE_LENGTH = 300_000;

function isValidImageDataUrl(value) {
  return typeof value === 'string' && value.length <= MAX_IMAGE_LENGTH && IMAGE_DATA_URL.test(value);
}

module.exports = { isValidImageDataUrl, MAX_IMAGE_LENGTH };
