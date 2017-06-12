const BER = require('./ber.js');
const errors = require('./errors.js');
const util = require('util');
const Enum = require('enum');

module.exports.GetDirectory = 32;

/****************************************************************************
 * Root
 ***************************************************************************/

function Root() {
    Root.super_.call(this);
    //Object.defineProperty(this, '_parent', {value: null, enumerable: false});
};

util.inherits(Root, TreeNode);

Root.decode = function(ber) {
    var r = new Root();
    ber.readSequence(BER.APPLICATION(0));
    var tag = ber.readSequence();

    if(tag == BER.APPLICATION(11)) {
        r.elements = [];
        var seq = ber.getSequence(BER.CONTEXT(0));
        while(seq.remain > 0) {
            r.addElement(RootElement.decode(seq));
        }
        
    } else {
        // StreamCollection BER.APPLICATION(6)
        // InvocationResult BER.APPLICATION(23)
        throw new errors.UnimplementedEmberTypeError(tag);
    }
    return r;
}

Root.prototype.addElement = function(ele) {
    ele._parent = this;
    if(this.elements === undefined) {
        this.elements = [];
    }
    this.elements.push(ele);
}

Root.prototype.addChild = function(child) {
    this.addElement(child);
}

Root.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(0));

    if(this.elements !== undefined) {
        ber.startSequence(BER.APPLICATION(11));
        ber.startSequence(BER.CONTEXT(0));
        for(var i=0; i<this.elements.length; i++) {
            this.elements[i].encode(ber);
        }
        ber.endSequence(); // BER.CONTEXT(0)
        ber.endSequence();
    }

    ber.endSequence(); // BER.APPLICATION(0)
}

Root.prototype.getChildren = function() {
    if(this.elements !== undefined) {
        return this.elements;
    }
    return null;
}

module.exports.Root = Root;

/****************************************************************************
 * TreeNode (abstract)
 ***************************************************************************/

function TreeNode() {
    Object.defineProperty(this, '_parent', {value: null, enumerable: false, writable: true});
    Object.defineProperty(this, '_single_callbacks', {value: [], enumerable: false, writable: true});
    Object.defineProperty(this, '_callbacks', {value: [], enumerable: false, writable: true});
    //this._parent = null;
    //this._single_callbacks = [];
    //this._callbacks = []
}

TreeNode.prototype.addChild = function(child) {
    child._parent = this;
    if(this.children === undefined) {
        this.children = [];
    }
    this.children.push(child);
}

TreeNode.prototype.getMinimal = function() {
    return new this.constructor(this.number);
}

TreeNode.prototype.getTreeBranch = function(child) {
    var m = this.getMinimal();
    if(child !== undefined) {
        //console.log('addChild', child);
        m.addChild(child);
    }

    if(this._parent === null) {
        return m;
    } else {
        var p = this._parent.getTreeBranch(m);
        return p;
    }
}

TreeNode.prototype.getDirectory = function(callback) {
    if(callback !== undefined) {
        this._single_callbacks.push(callback);
    }
    return this.getTreeBranch(new Command(32));
}

TreeNode.prototype.getChildren = function() {
    if(this.children !== undefined) {
        return this.children;
    }
    return null;
}

TreeNode.prototype.getElementByNumber = function(index) {
    var children = this.getChildren();
    if(children === null) return null;
    for(var i=0; i<children.length; i++) {
        if(children[i].number === index) {
            return children[i];
        }
    }
    return null;
}

TreeNode.prototype.getElementByIdentifier = function(identifier) {
    var children = this.getChildren();
    if(children === null) return null;
    for(var i=0; i<children.length; i++) {
        if(children[i].contents !== undefined && 
          children[i].contents.identifier == identifier) {
            return children[i];
        }
    }
    return null;
}

TreeNode.prototype.getElement = function(id) {
    if(Number.isInteger(id)) {
        return this.getElementByNumber(id);
    } else {
        return this.getElementByIdentifier(id);
    }
}

TreeNode.prototype.update = function(other) {
    var self=this;
    var callbacks = [];
    while(this._single_callbacks.length > 0) {
        var cb = this._single_callbacks.shift();
        callbacks.push(() => {cb(self)});
    }

    for(var i=0; i<this._callbacks.length; i++) {
        var cb = this._callbacks[i];
        callbacks.push(() => {cb(self)});
    }

    return callbacks;
}

TreeNode.prototype.getNodeByPath = function(client, path, callback) {
    var self=this;
    
    if(path.length == 0) {
        callback(null, self);
        return;
    }
   
    var child = self.getElement(path[0]);
    if(child !== null) {
        child.getNodeByPath(client, path.slice(1), callback);
    } else {
        client.sendBERNode(self.getDirectory((node) => {
            child = node.getElement(path[0]);
            if(child === null) {
                callback('invalid path');
                return;
            } else {
                child.getNodeByPath(client, path.slice(1), callback);
            }
        }));
    }
}

/****************************************************************************
 * RootElement
 ***************************************************************************/

function RootElement() {};

RootElement.decode = function(ber) {
    return Element.decode(ber);

    // TODO: handle qualified types
}

/****************************************************************************
 * Element
 ***************************************************************************/

function Element() {};

Element.decode = function(ber) {
    var tag = ber.peek();
    if(tag == BER.APPLICATION(1)) {
        // Parameter
        return Parameter.decode(ber);
    } else if(tag == BER.APPLICATION(3)) {
        // Node
        return Node.decode(ber);
    } else if(tag == BER.APPLICATION(2)) {
        // Command
        return Command.decode(ber);
    } else if(tag == BER.APPLICATION(13)) {
        // Matrix
        throw new errors.UnimplementedEmberTypeError(tag);
    } else if(tag == BER.APPLICATION(19)) {
        // Function
        throw new errors.UnimplementedEmberTypeError(tag);
    } else if(tag == BER.APPLICATION(24)) {
        // Template
        throw new errors.UnimplementedEmberTypeError(tag);
    } else {
        throw new errors.UnimplementedEmberTypeError(tag);
    }
}

/****************************************************************************
 * ElementCollection
 ***************************************************************************/



/****************************************************************************
 * Node
 ***************************************************************************/

function Node(number) {
    Node.super_.call(this);
    if(number !== undefined)
        this.number = number;
};

util.inherits(Node, TreeNode);

Node.decode = function(ber) {
    var n = new Node();
    ber = ber.getSequence(BER.APPLICATION(3));

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == BER.CONTEXT(0)) {
            n.number = ber.readInt();
        } else if(tag == BER.CONTEXT(1)) {
            n.contents = NodeContents.decode(ber);
        } else if(tag == BER.CONTEXT(2)) {
            n.children = [];
            var seq = ber.getSequence(BER.APPLICATION(4));
            while(seq.remain > 0) {
                seq.readSequence(BER.CONTEXT(0));
                n.addChild(Element.decode(seq));
            }
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }
    return n;
}

Node.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(3));
    
    ber.startSequence(BER.CONTEXT(0));
    ber.writeInt(this.number);
    ber.endSequence(); // BER.CONTEXT(0)

    if(this.contents !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        this.contents.encode(ber);
        ber.endSequence(); // BER.CONTEXT(1)
    }

    if(this.children !== undefined) {
        ber.startSequence(BER.CONTEXT(2));
        ber.startSequence(BER.APPLICATION(4));
        ber.startSequence(BER.CONTEXT(0));
        for(var i=0; i<this.children.length; i++) {
            this.children[i].encode(ber);
        }
        ber.endSequence();
        ber.endSequence();
        ber.endSequence();
    }

    ber.endSequence(); // BER.APPLICATION(3)
}

Node.prototype.update = function(other) {
    callbacks = Node.super_.prototype.update.apply(this);
    if(other.contents !== undefined)
        this.contents = other.contents;
    return callbacks;
}

module.exports.Node = Node;

/****************************************************************************
 * NodeContents
 ***************************************************************************/

function NodeContents() {
    this.isOnline = true;
};

NodeContents.decode = function(ber) {
    var nc = new NodeContents();
    ber = ber.getSequence(BER.EMBER_SET);

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == BER.CONTEXT(0)) {
            nc.identifier = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(1)) {
            nc.description = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(2)) {
            nc.isRoot = ber.readBoolean();
        } else if(tag == BER.CONTEXT(3)) {
            nc.isOnline = ber.readBoolean();
        } else if(tag == BER.CONTEXT(4)) {
            nc.schemaIdentifiers = ber.readString(BER.EMBER_STRING);
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }

    return nc;
}

NodeContents.prototype.encode = function(ber) {
    ber.startSequence(BER.EMBER_SET);
    
    if(this.identifier !== undefined) {
        ber.startSequence(BER.CONTEXT(0));
        ber.writeString(this.identifier, BER.EMBER_STRING);
        ber.endSequence(); // BER.CONTEXT(0)
    }
    
    if(this.description !== undefined) {
        ber.startSequence(BER.CONTEXT(1));
        ber.writeString(this.description, BER.EMBER_STRING);
        ber.endSequence(); // BER.CONTEXT(1)
    }
    
    if(this.isRoot !== undefined) {
        ber.startSequence(BER.CONTEXT(2));
        ber.writeBoolean(this.isRoot);
        ber.endSequence(); // BER.CONTEXT(2)
    }
    
    if(this.isOnline !== undefined) {
        ber.startSequence(BER.CONTEXT(3));
        ber.writeBoolean(this.isOnline);
        ber.endSequence(); // BER.CONTEXT(3)
    }
    
    if(this.schemaIdentifiers !== undefined) {
        ber.startSequence(BER.CONTEXT(4));
        ber.writeString(this.schemaIdentifiers, BER.EMBER_STRING);
        ber.endSequence(); // BER.CONTEXT(4)
    }

    ber.endSequence(); // BER.EMBER_SET
}

module.exports.NodeContents = NodeContents;

/****************************************************************************
 * Command
 ***************************************************************************/

function Command(number) {
    if(number !== undefined)
        this.number = number;
}

Command.decode = function(ber) {
    var c = new Command();
    ber = ber.getSequence(BER.APPLICATION(2));

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == BER.CONTEXT(0)) {
            c.number = ber.readInt();
        } else {
            // TODO: options
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }

    return c;
}

Command.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(2));
    
    ber.startSequence(BER.CONTEXT(0));
    ber.writeInt(this.number);
    ber.endSequence(); // BER.CONTEXT(0)

    // TODO: options

    ber.endSequence(); // BER.APPLICATION(2)
}

module.exports.Command = Command;

/****************************************************************************
 * Parameter
 ***************************************************************************/

function Parameter(number) {
    Parameter.super_.call(this);
    if(number !== undefined)
        this.number = number;
}

util.inherits(Parameter, TreeNode);

Parameter.decode = function(ber) {
    var p = new Parameter();
    ber = ber.getSequence(BER.APPLICATION(1));

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == BER.CONTEXT(0)) {
            p.number = ber.readInt();
        } else if(tag == BER.CONTEXT(1)) {
            p.contents = ParameterContents.decode(ber);
        } else if(tag == BER.CONTEXT(2)) {
            p.children = [];
            var seq = ber.getSequence(BER.APPLICATION(4));
            while(seq.remain > 0) {
                seq.readSequence(BER.CONTEXT(0));
                p.addChild(Element.decode(seq));
            }
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }

    return p;
}

var ParameterAccess = new Enum({
    none: 0,
    read: 1,
    write: 2,
    readWrite: 3
});

var ParameterType = new Enum({
    integer: 1,
    real: 2,
    string: 3,
    boolean: 4,
    trigger: 5,
    enum: 6,
    octets: 7
});

function ParameterContents() {};

ParameterContents.decode = function(ber) {
    var pc = new ParameterContents();
    ber = ber.getSequence(BER.EMBER_SET);

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == BER.CONTEXT(0)) {
            pc.identifier = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(1)) {
            pc.description = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(2)) {
            pc.value = ber.readValue();
        } else if(tag == BER.CONTEXT(3)) {
            pc.minimum = ber.readValue();
        } else if(tag == BER.CONTEXT(4)) {
            pc.maximum = ber.readValue();
        } else if(tag == BER.CONTEXT(5)) {
            pc.access = ParameterAccess.get(ber.readInt());
        } else if(tag == BER.CONTEXT(6)) {
            pc.format = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(7)) {
            pc.enumeration = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(8)) {
            pc.factor = ber.readInt();
        } else if(tag == BER.CONTEXT(9)) {
            pc.isOnline = ber.readBoolean();
        } else if(tag == BER.CONTEXT(10)) {
            pc.formula = ber.readString(BER.EMBER_STRING);
        } else if(tag == BER.CONTEXT(11)) {
            pc.step = ber.readInt();
        } else if(tag == BER.CONTEXT(12)) {
            pc.default = ber.readValue();
        } else if(tag == BER.CONTEXT(13)) {
            pc.type = ParameterType.get(ber.readInt());
        } else if(tag == BER.CONTEXT(14)) {
            pc.streamIdentifier = ber.readInt();
        } else if(tag == BER.CONTEXT(15)) {
            pc.enumMap = StringIntegerCollection.decode(ber);
        } else if(tag == BER.CONTEXT(16)) {
            pc.streamDescriptor = StreamDescription.decode(ber);
        } else if(tag == BER.CONTEXT(17)) {
            pc.schemaIdentifiers = ber.readString(BER.EMBER_STRING);
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }

    return pc;
}

var writeIfDefined = function(ber, property, writer, outer, inner) {
    if(property !== undefined) {
        ber.startSequence(BER.CONTEXT(outer));
        writer(property, inner);
        ber.endSequence();
    }
}

var writeIfDefinedEnum = function(ber, property, type, writer, outer, inner) {
    if(property !== undefined) {
        ber.startSequence(BER.CONTEXT(outer));
        if(property.value !== undefined) {
            writer(property.value, inner);
        } else {
            writer(type.get(property), inner);
        }
        ber.endSequence();
    }
}

ParameterContents.prototype.encode = function(ber) {
    ber.startSequence(BER.EMBER_SET);
    
    writeIfDefined(ber, this.identifier, ber.writeString, 0, BER.EMBER_STRING);
    writeIfDefined(ber, this.description, ber.writeString, 1, BER.EMBER_STRING);
    writeIfDefined(ber, this.value, ber.writeValue, 2);
    writeIfDefined(ber, this.minimum, ber.writeValue, 3);
    writeIfDefined(ber, this.maximum, ber.writeValue, 4);
    writeIfDefinedEnum(ber, this.access, ParameterAccess, ber.writeInt, 5);
    writeIfDefined(ber, this.format, ber.writeString, 6, BER.EMBER_STRING);
    writeIfDefined(ber, this.enumeration, ber.writeString, 7, BER.EMBER_STRING);
    writeIfDefined(ber, this.factor, ber.writeInt, 8);
    writeIfDefined(ber, this.isOnline, ber.writeBoolean, 9);
    writeIfDefined(ber, this.formula, ber.writeString, 10, BER.EMBER_STRING);
    writeIfDefined(ber, this.step. ber.writeInt, 11);
    writeIfDefined(ber, this.default, ber.writeValue, 12);
    writeIfDefinedEnum(ber, this.type, ParameterType, ber.writeInt, 13);
    writeIfDefined(ber, this.streamIdentifier, ber.writeInt, 14);
   
    if(this.emumMap !== undefined) {
        ber.startSequence(BER.CONTEXT(15)); 
        StringIntegerCollection.encode(ber, this.enumMap);
        ber.endSequence();
    }

    if(this.streamDescriptor !== undefined) {
        ber.startSequence(BER.CONTEXT(16)); 
        this.streamDescriptor.encode(ber);
        ber.endSequence();
    }

    writeIfDefined(ber, this.schemaIdentifiers, ber.writeString, 17, BER.EMBER_STRING);

    ber.endSequence();
}

/****************************************************************************
 * StringIntegerCollection
 ***************************************************************************/

// This is untested, VPB doesn't seem to use this that I've seen so far

function StringIntegerCollection() {};

StringIntegerCollection.decode = function(ber) {
    var enumMap = {};
    ber = ber.getSequence(BER.APPLICATION(8));
    while(ber.remain > 0) {
        ber.readSequence(BER.CONTEXT(0));
        var seq = ber.getSequence(BER.APPLICATION(7));
        var entryString, entryInteger;
        while(seq.remain > 0) {
            var tag = seq.readSequence();
            if(tag == BER.CONTEXT(0)) {
                entryString = seq.readString(BER.EMBER_STRING);
            } else if(tag == BER.CONTEXT(1)) {
                entryInteger = seq.readInt();
            } else {
                throw new errors.UnimplementedEmberTypeError(tag);
            }
        }

        enumMap[entryString] = entryInteger;
    }

    return new Enum(enumMap);
}

StringIntegerCollection.encode = function(ber, e) {
    ber.startSequence(BER.APPLICATION(8));
    ber.startSequence(BER.CONTEXT(0));
    e.enums.forEach((item) => {
        ber.startSequence(BER.APPLICATION(7));
        ber.startSequence(BER.CONTEXT(0));
        ber.writeString(item.key, BER.EMBER_STRING);
        ber.endSequence();
        ber.startSequence(BER.CONTEXT(1));
        ber.writeInt(item.value);
        ber.endSequence();
        ber.endSequence();
    });
    ber.endSequence();
    ber.endSequence();
}

/****************************************************************************
 * StreamDescription
 ***************************************************************************/

var StreamFormat = new Enum({
    unsignedInt8: 0,
    unsignedInt16BigEndian: 2,
    unsignedInt16LittleEndian: 3,
    unsignedInt32BigEndian: 4,
    unsignedInt32LittleEndian: 5,
    unsignedInt64BigEndian: 6,
    unsignedInt64LittleENdian: 7,
    signedInt8: 8,
    signedInt16BigEndian: 10,
    signedInt16LittleEndian: 11,
    signedInt32BigEndian: 12,
    signedInt32LittleEndian: 13,
    signedInt64BigEndian: 14,
    signedInt64LittleEndian: 15,
    ieeeFloat32BigEndian: 20,
    ieeeFloat32LittleEndian: 21,
    ieeeFloat64BigEndian: 22,
    ieeeFloat64LittleEndian: 23
});

function StreamDescription() {};

StreamDescription.decode = function(ber) {
    var sd = new StreamDescription();
    ber = ber.getSequence(BER.APPLICATION(12));

    while(ber.remain > 0) {
        var tag = ber.readSequence();
        if(tag == BER.CONTEXT(0)) {
            sd.format = StreamFormat.get(ber.readInt());
        } else if(tag == BER.CONTEXT(1)) {
            sd.offset = ber.readInt();
        } else {
            throw new errors.UnimplementedEmberTypeError(tag);
        }
    }

    return sd;
}

StreamDescription.prototype.encode = function(ber) {
    ber.startSequence(BER.APPLICATION(12));

    writeIfDefinedEnum(ber, this.format, StreamFormat, ber.writeInt, 0);
    writeIfDefined(ber, this.offset, ber.writeInt, 1);

    ber.endSequence();
}


