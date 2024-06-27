function _classCallCheck(instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
}

function _defineProperties(target, props) {
  for (var i = 0; i < props.length; i++) {
    var descriptor = props[i];
    descriptor.enumerable = descriptor.enumerable || false;
    descriptor.configurable = true;
    if ("value" in descriptor) descriptor.writable = true;
    Object.defineProperty(target, descriptor.key, descriptor);
  }
}

function _createClass(Constructor, protoProps, staticProps) {
  if (protoProps) _defineProperties(Constructor.prototype, protoProps);
  if (staticProps) _defineProperties(Constructor, staticProps);
  Object.defineProperty(Constructor, "prototype", {
    writable: false
  });
  return Constructor;
}

function _defineProperty(obj, key, value) {
  if (key in obj) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  } else {
    obj[key] = value;
  }

  return obj;
}

function _inherits(subClass, superClass) {
  if (typeof superClass !== "function" && superClass !== null) {
    throw new TypeError("Super expression must either be null or a function");
  }

  subClass.prototype = Object.create(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      writable: true,
      configurable: true
    }
  });
  Object.defineProperty(subClass, "prototype", {
    writable: false
  });
  if (superClass) _setPrototypeOf(subClass, superClass);
}

function _getPrototypeOf(o) {
  _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) {
    return o.__proto__ || Object.getPrototypeOf(o);
  };
  return _getPrototypeOf(o);
}

function _setPrototypeOf(o, p) {
  _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) {
    o.__proto__ = p;
    return o;
  };
  return _setPrototypeOf(o, p);
}

function _isNativeReflectConstruct() {
  if (typeof Reflect === "undefined" || !Reflect.construct) return false;
  if (Reflect.construct.sham) return false;
  if (typeof Proxy === "function") return true;

  try {
    Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {}));
    return true;
  } catch (e) {
    return false;
  }
}

function _assertThisInitialized(self) {
  if (self === void 0) {
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  }

  return self;
}

function _possibleConstructorReturn(self, call) {
  if (call && (typeof call === "object" || typeof call === "function")) {
    return call;
  } else if (call !== void 0) {
    throw new TypeError("Derived constructors may only return object or undefined");
  }

  return _assertThisInitialized(self);
}

function _createSuper(Derived) {
  var hasNativeReflectConstruct = _isNativeReflectConstruct();

  return function _createSuperInternal() {
    var Super = _getPrototypeOf(Derived),
        result;

    if (hasNativeReflectConstruct) {
      var NewTarget = _getPrototypeOf(this).constructor;

      result = Reflect.construct(Super, arguments, NewTarget);
    } else {
      result = Super.apply(this, arguments);
    }

    return _possibleConstructorReturn(this, result);
  };
}

function _superPropBase(object, property) {
  while (!Object.prototype.hasOwnProperty.call(object, property)) {
    object = _getPrototypeOf(object);
    if (object === null) break;
  }

  return object;
}

function _get() {
  if (typeof Reflect !== "undefined" && Reflect.get) {
    _get = Reflect.get.bind();
  } else {
    _get = function _get(target, property, receiver) {
      var base = _superPropBase(target, property);

      if (!base) return;
      var desc = Object.getOwnPropertyDescriptor(base, property);

      if (desc.get) {
        return desc.get.call(arguments.length < 3 ? target : receiver);
      }

      return desc.value;
    };
  }

  return _get.apply(this, arguments);
}

function isStyled(node) {
  return node && !!node.style;
}
/**
 * Creates a class that extends Quill's built-in Image format
 * (or a derived class) with functionality to recognize and
 * apply additional formats known to this package.
 *
 * Relies on the base-class implementation for width and height,
 * so it may break if inheritance is not properly preserved, i.e.
 * if another module completely overrides Image.
 *
 * To avoid import-ordering issues, this is a class factory
 * instead of a statically defined class.
 */


function imageWithFormats(Quill) {
  var Image = Quill["import"]('formats/image');
  var DOWNCONVERT_STYLES = ['width', 'height'];
  var STYLES = ['float'];
  var STYLE_VALUES = {
    "float": ['left', 'right']
  };
  return /*#__PURE__*/function (_Image) {
    _inherits(ImageWithFormats, _Image);

    var _super = _createSuper(ImageWithFormats);

    function ImageWithFormats() {
      _classCallCheck(this, ImageWithFormats);

      return _super.apply(this, arguments);
    }

    _createClass(ImageWithFormats, [{
      key: "format",
      value: function format(name, value) {
        if (!this.domNode || !isStyled(this.domNode)) return;

        if (STYLES.indexOf(name) >= 0) {
          if (!value || STYLE_VALUES[name].indexOf(value) >= 0) {
            // quill likes `false` to remove a style; DOM likes `null`
            this.domNode.style[name] = value || null;
          }
        } else _get(_getPrototypeOf(ImageWithFormats.prototype), "format", this).call(this, name, value);
      }
    }], [{
      key: "formats",
      value: function formats(domNode) {
        // img attributes (width, height, etc)
        var inherited = Image.formats(domNode); // CSS styles (float, etc)

        var local = STYLES.reduce(function (formats, style) {
          var value = domNode.style[style];
          if (value && STYLE_VALUES[style].indexOf(value) >= 0) formats[style] = value;
          return formats;
        }, {}); // CSS styles that should be attributes, but might be pasted from
        // noncomformant source -- downconvert them to attributes

        var downconverted = DOWNCONVERT_STYLES.reduce(function (formats, style) {
          var value = domNode.style[style];
          if (value && value.endsWith('px')) formats[style] = value.replace('px', '');
          return formats;
        }, {});
        return Object.assign({}, inherited, downconverted, local);
      }
    }]);

    return ImageWithFormats;
  }(Image);
}

var extend = /*#__PURE__*/Object.freeze({
  __proto__: null,
  imageWithFormats: imageWithFormats
});

// Must rely on return type inference due to bizarre Parchment typings (right?)
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
function createFormats(Quill) {
  var parchment = Quill["import"]('parchment');
  var Float = new parchment.Attributor.Style('float', 'float', {
    scope: parchment.Scope.INLINE_BLOT,
    whitelist: ['left', 'right']
  });
  var Height = new parchment.Attributor.Attribute('height', 'height', {
    scope: parchment.Scope.INLINE_BLOT
  });
  var Width = new parchment.Attributor.Attribute('width', 'width', {
    scope: parchment.Scope.INLINE_BLOT
  });
  return {
    Float: Float,
    Height: Height,
    Width: Width
  };
}

var formats = /*#__PURE__*/Object.freeze({
  __proto__: null,
  createFormats: createFormats
});

/**
 * Perform one-time setup of Quill registry.
 *
 * Ideally we could do this in a static ImageFormats.register, but Quill
 * doesn't pass a reference to the Quill class when it calls the static
 * function, so there's no way for us to access the "right" Quill class
 * and its singleton Parchment registry.
 *
 * As a workaround, we defer registration until our module is constructed,
 * at which point we can reference the editor's constructor to obtain
 * whichever instance of the Quill class we're being used with.
 */

function register(Quill) {
  var ImageWithFormats = imageWithFormats(Quill);

  var _formats$createFormat = createFormats(Quill),
      Float = _formats$createFormat.Float,
      Height = _formats$createFormat.Height,
      Width = _formats$createFormat.Width;

  Quill.register('formats/float', Float);
  Quill.register('formats/height', Height);
  Quill.register('formats/image', ImageWithFormats, true);
  Quill.register('formats/width', Width);
}
/**
 * Quill module that registers some new formats to enhance image editing.
 * Adds support for width, height and float attributes in Quill Delta and
 * HTML.
 *
 * For basic use, just register this class with Quill; its static register()
 * callback registers all supported formats and the module provides no other
 * functionality.
 *
 * For advanced use, you can skip registering the plugin; import the
 * formats directly from `formats` or `extend` and register them yourself
 * (potentially after providing tweaks or overrides).
 */


var ImageFormats = /*#__PURE__*/_createClass(function ImageFormats(quill) {
  _classCallCheck(this, ImageFormats);

  if (!ImageFormats.registered) {
    register(quill.constructor);
    ImageFormats.registered = true;
  }
});

_defineProperty(ImageFormats, "registered", false);

export { ImageFormats, extend, formats };
