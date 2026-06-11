function success(data, message = 'success') {
  return {
    code: 0,
    message,
    data: data || {}
  };
}

function error(message, code = 1, data = {}) {
  return {
    code,
    message,
    data
  };
}

module.exports = {
  success,
  error
};
