#!/bin/bash

mkdir -p bin
cd bin

programs="ffmpeg2theora ffmpeg"
for prog in $programs; do
    for ext in linux macosx exe; do
        echo $prog.$ext
        curl http://firefogg.org/bin/$prog.$ext > $prog.$ext
    done
done
