
var moment = require('moment'),
    bigInt = require('big-integer');
var dataType = require('./data-type');


exports.check = function (value, type) {
    var type = dataType.get(type)||{},
        func = name(type.name);
    return func(value, type);
}

// internal api

function name (type) {
    var func = null;
    switch (true) {
        case /tinyint|smallint|mediumint|integer|bigint|int|bit/i.test(type):
            func = exact;
            break;
        case /decimal|numeric/i.test(type):
            func = fixedPoint;
            break;
        case /float|double|real/i.test(type):
            func = approximate;
            break;
        case /varchar|char/i.test(type):
            func = char;
            break;
        case /tinytext|mediumtext|longtext|text/i.test(type):
            func = text;
            break;
        case /datetime|timestamp/i.test(type):
            func = datetime;
            break;
        case /date/i.test(type):
            func = date;
            break;
        case /time/i.test(type):
            func = time;
            break;
        case /year/i.test(type):
            func = year;
            break;
        case /enum|set/i.test(type):
            func = enumerate;
            break;
        default:
            func = function () {return null}
            break;
    }
    return func;
}

function exact (value, type) {
    var num = parseInt(value);
    if (isNaN(num)) {
        return new Error('not valid');
    } else {
        var range = INT[type.name.toLowerCase()][type.unsigned?'unsigned':'signed'];
        if (type.name.match(/bigint/i)) {
            num = bigInt(value);
            return (num.greaterOrEquals(range.min) && num.lesserOrEquals(range.max))
                ? null : new Error('out of range');
        } else {
            return (num >= range.min && num <= range.max)
                ? null : new Error('out of range');
        }
    }
}

function fixedPoint (value, type) {
    if (!/^-?\d+(\.\d+)?$/i.test(value)) {
        return new Error('not valid');
    }
    var num = parseFloat(value);
    if (isNaN(num)) {
        return new Error('not valid');
    }
    if (!isFinite(num)) { // +- 1.79769313486232e+308
        return new Error('out of range');
    }

    // defaults
    if (!type.value) {
        type.value = [];
        type.value.push(10); // 10,0 default
        var range = FLOAT[type.name.toLowerCase()][type.unsigned?'unsigned':'signed'],
            format = rangeFormat(type);
        return format.test(value) && (num >= range.min && num <= range.max)
            ? null : new Error('out of range');
    }
    
    if (type.value) {
        var range = createRange(type),
            format = rangeFormat(type);
        return format.test(value) && (num >= range.min && num <= range.max)
            ? null : new Error('out of range');
    }
    return null;
}

function approximate (value, type) {
    if (!/^-?\d+(\.\d+)?$/i.test(value)) {
        return new Error('not valid');
    }
    var num = parseFloat(value);
    if (isNaN(num)) {
        return new Error('not valid');
    }
    if (!isFinite(num)) { // +- 1.79769313486232e+308
        return new Error('out of range');
    }

    // defaults
    if (!type.value) {
        var range = FLOAT[type.name.toLowerCase()][type.unsigned?'unsigned':'signed'];
        return (num >= range.min && num <= range.max)
            ? null : new Error('out of range');
    }
    
    if (type.value) {
        var range = createRange(type),
            format = rangeFormat(type);
        return format.test(value) && (num >= range.min && num <= range.max)
            ? null : new Error('out of range');
    }
    return null;
}

function char (value, type) {
    if (!type.value) {
        type.value = [];
        type.value.push(1);
    }
    return (value.length <= type.value[0])
        ? null : new Error('out of range');
}

function text (value, type) {
    if (type.name === 'tinytext') {
        return (value.length <= 255)
            ? null : new Error('out of range');
    }
    // no validation - text:0-64Kb,meduimtext:0-16Mb,longtext:0-4Gb
    return null;
}

function date (value, type) {
    var regex = REGEX.date;
    for (var i=0; i < regex.length; i++) {
        if (regex[i].test(value)) {
            var length = regex[i].exec(value)[1].length,
                format = i == 0
                ? (length == 4 ? 'YYYY-MM-DD' : 'YY-MM-DD')
                : (length == 4 ? 'YYYYMMDD' : 'YYMMDD');		
            if (moment(value, format).isValid()) return null;
        }
    }
    return new Error('malformed');
}

function year (value, type) {
    var regex = REGEX.year;
    if (regex[0].test(value)) {
        var year = parseInt(value);
        return value.length == 4 
            ? (year >= 1901 && year <= 2155) ? null : new Error('malformed')
            : null;
    }
    return new Error('malformed');
}

function time (value, type) {
    var regex = REGEX.time;
    for (var i=0; i < regex.length; i++) {
        if (regex[i].test(value)) return null;
    }
    return new Error('malformed');
}

function datetime (value, type) {
    var regex = REGEX.datetime;
    for (var i=0; i < regex.length; i++) {
        if (regex[i].test(value)) {
            var match = regex[i].exec(value),
                time = match[5],
                length = match[1].length,
                format = 
                i == 0
                ? (length == 4 
                    ? (time ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD')
                    : (time ? 'YY-MM-DD HH:mm:ss' : 'YY-MM-DD'))
                : (length == 4 
                    ? (time ? 'YYYYMMDDHHmmss' : 'YYYYMMDD') 
                    : (time ? 'YYMMDDHHmmss' : 'YYMMDD'));
            if (moment(value, format).isValid()) return null;
        }
    }
    return new Error('malformed');
}

function enumerate (value, type) {
    // not implemented
    return null;
}

// helper api

function createRange (type) {
    // example:
    // type.value = [6,2]
    // min: -9999.99
    // max: 9999.99
    // type.value = [6,2] unsigned
    // min: 0
    // max: 9999.99
    function gen (length) {
        var str = '';
        for (var i=0; i < length; i++) {
            str += '9';
        }
        return str;
    }
    var m = type.value[0],
        d = type.value[1] ? type.value[1] : 0;
    m = gen(m-d), d = gen(d);
    var num = parseFloat(m+'.'+d);
    return type.unsigned 
        ? { min: 0, max: num }
        : { min: num*(-1), max: num };
}

function rangeFormat (type) {
    var m = type.value[0],
        d = type.value[1] ? type.value[1] : 0;
    m = m-d;
    return d == 0
        ? new RegExp('^-?\\d{1,'+m+'}$', 'i')
        : new RegExp('^-?\\d{1,'+m+'}(\\.\\d{1,'+d+'})?$', 'i');
}

// static data

var REGEX = {
    // DATE
    date: [	
        // YYYY|YY-MM|M-DD|D
        new RegExp(
            '^(\\d{4}|\\d{2})'+                 // year YYYY|YY
            '[^a-zA-Z\\d\\s]+'+                 // separator
            '(1[0-2]|0?[0-9])'+                 // month 1-12
            '[^a-zA-Z\\d\\s]+'+                 // separator
            '(3[0-1]|(1|2)[0-9]|0?[0-9])'+      // day 1-31
            '[^\\d]*$'                          // anything but number at the end
        , 'i'),
        // YYYY|YYMMDD
        new RegExp(
            '^(\\d{4}|\\d{2})'+                 // year YYYY|YY
            '(1[0-2]|0[0-9])'+                  // month 01-12
            '(3[0-1]|(0|1|2)[0-9])$'            // day 01-31
        , 'i')
    ],
    // YEAR
    year: [
        // Y|YY|YYYY
        new RegExp(
            '^(\\d{4}|\\d{2}|\\d{1})'+          // year YYYY|YY|Y
            '[^\\d]*$'                          // anything but number at the end
        , 'i')
    ],
    // TIME
    time: [
        // D? H|HH:M|MM:S|SS, D? H|HH:M|MM, D? H|HH
        new RegExp(
            '^((3[0-4]|[0-2]?[0-9])\\s)?'+      // day 0-34
            '(2[0-4]|[0-1]?[0-9])'+             // hour 0-24
            '(:'+                               // separator
            '([0-5]?[0-9]))?'+                  // minute 0-59?
            '(:'+                               // separator
            '([0-5]?[0-9]))?'+                  // second 0-59?
            '[^\\d]*$'                          // anything but number at the end
        , 'i'),
        // H|HH|HHH:M|MM:S|SS, H|HH|HHH:M|MM
        new RegExp(
            '^(8[0-3][0-8]|[0-7]?[0-9]?[0-9]?)'+// hour 0-838
            ':'+                                // separator
            '([0-5]?[0-9])'+                    // minute 0-59
            '(:'+                               // separator
            '([0-5]?[0-9]))?'+                  // second 0-59?
            '[^\\d]*$'                          // anything but number at the end
        , 'i'),
        // HH|HHHMMSS
        new RegExp(
            '^(8[0-3][0-8]|[0-7]?[0-9][0-9])'+  // hour 00-838
            '([0-5][0-9])'+                     // minute 00-59
            '([0-5][0-9])'+                     // second 00-59
            '[^\\d]*$'                          // anything but number at the end
        , 'i'),
        // SS
        new RegExp(
            '^[0-5]?[0-9]$'                     // second 0-59
        , 'i')
    ],
    // DATETIME, TIMESTAMP
    datetime: [
        // YYYY|YY-MM|M-DD|D HH|H:MM|M:SS|S
        new RegExp(
            '^(\\d{4}|\\d{2})'+                 // year YYYY|YY
            '[^a-zA-Z\\d]+'+                    // separator
            '(1[0-2]|0?[0-9])'+                 // month 1-12
            '[^a-zA-Z\\d]+'+                    // separator
            '(3[0-1]|(1|2)[0-9]|0?[0-9])'+      // day 1-31

            '([^a-zA-Z\\d]+'+                   // separator
            '(2[0-4]|[0-1]?[0-9])'+             // hour 0-24
            '[^a-zA-Z\\d]+'+                    // separator
            '([0-5]?[0-9])'+                    // minute 0-59
            '[^a-zA-Z\\d]+'+                    // separator
            '([0-5]?[0-9]))?'+                  // second 0-59
            '[^\\d]*$'                          // anything but number at the end
        , 'i'),
        // YYYY|YYMMDDHHMMSS
        new RegExp(
            '^(\\d{4}|\\d{2})'+                 // year YYYY|YY
            '(1[0-2]|0[0-9])'+                  // month 01-12
            '(3[0-1]|(0|1|2)[0-9])'+            // day 01-31
            
            '((2[0-4]|[0-1][0-9])'+             // hour 0-24
            '([0-5][0-9])'+                     // minute 00-59
            '([0-5][0-9]))?$'                   // second 00-59
        , 'i')
    ]
};

var INT = {
    int: {
        signed: { min: -2147483648, max: 2147483647 },
        unsigned: { min: 0, max: 4294967295 }
    },
    integer: {
        signed: { min: -2147483648, max: 2147483647 },
        unsigned: { min: 0, max: 4294967295 }
    },
    mediumint: {
        signed: { min: -8388608, max: 8388607 },
        unsigned: { min: 0, max: 16777215 }
    },
    smallint: {
        signed: { min: -32768, max: 32767 },
        unsigned: { min: 0, max: 65535 }
    },
    tinyint: {
        signed: { min: -128, max: 127 },
        unsigned: { min: 0, max: 255 }
    },
    bit: {
        signed: { min: 1, max: 64 }
    },
    bigint: {
        signed: { min: bigInt('-9223372036854775808'),
                max: bigInt('9223372036854775807') },
        unsigned: { min: 0, max: bigInt('18446744073709551615') }
    }
}

var FLOAT = {
    float: {
        signed: { min: -3.40282e+38, max: 3.40282e+38 },
        unsigned: { min: 0, max: 3.40282e+38 }
    },
    double: {
        signed: { min: -Infinity, max: Infinity },
        unsigned: { min: 0, max: Infinity }
    },
    decimal: {
        signed: { min: -9999999999, max: 9999999999 },
        unsigned: { min: 0, max: 9999999999 }
    },
    numeric: {
        signed: { min: -9999999999, max: 9999999999 },
        unsigned: { min: 0, max: 9999999999 }
    }
}
