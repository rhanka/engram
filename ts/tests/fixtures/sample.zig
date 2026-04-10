const std = @import("std");
const mem = @import("std").mem;

const Point = struct {
    x: f64,
    y: f64,

    pub fn distance(self: Point, other: Point) f64 {
        const dx = self.x - other.x;
        const dy = self.y - other.dy;
        return std.math.sqrt(dx * dx + dy * dy);
    }
};

const Color = enum {
    red,
    green,
    blue,
};

const Shape = union(enum) {
    circle: f64,
    rect: Point,
};

pub fn add(a: i32, b: i32) i32 {
    return a + b;
}

pub fn multiply(a: i32, b: i32) i32 {
    return a * b;
}

pub fn main() void {
    const result = add(1, 2);
    _ = multiply(result, 3);
}
