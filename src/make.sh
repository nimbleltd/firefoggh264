#!/bin/sh
cd `dirname $0` 
PREFIX=/usr/lib/firefox-devel
IDL_PREFIX=$PREFIX/idl
TYPELIB="python $PREFIX/sdk/bin/typelib.py"

for i in nsIFirefogg nsIFirefoggProtocol; do
    XPT=../Firefogg/components/$i.xpt
    IDL=$i.idl
    $TYPELIB -I$IDL_PREFIX -o $XPT $IDL
done
