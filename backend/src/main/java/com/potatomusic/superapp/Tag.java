package com.potatomusic.superapp;

/** A named, colour-coded block or genre. */
public class Tag {
    public String name;
    public String color;

    public Tag() {
    }

    public Tag(String name, String color) {
        this.name = name;
        this.color = color;
    }

    public Tag copy() {
        return new Tag(name, color);
    }
}
