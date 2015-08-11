#!/bin/bash
cd `dirname $0`

# magic bzr->git conversion offset
git_count=$(git rev-list HEAD --count)
version=$(($git_count-31))

#update idl file
./src/make.sh
mkdir -p dist

function create_xpi() {
    rm -f dist/Firefogg-$version.$os.xpi
    cd Firefogg
    extra=""
    if [ "x$os" == "xwin32" ]; then
        zip -9 -r ../dist/Firefogg-$version.$os.xpi * \
            -x \*'~' -x \*.orig -x \*.so -x \*.dylib
    fi
    if [ "x$os" == "xlinux" ]; then
        zip -9 -r ../dist/Firefogg-$version.$os.xpi * \
            -x \*'~' -x \*.orig -x \*.dll -x \*.dylib
    fi
    if [ "x$os" == "xmacosx" ]; then
        zip -9 -r ../dist/Firefogg-$version.$os.xpi * \
            -x \*'~' -x \*.orig -x \*.so -x \*.dll
    fi
    cd ..
}

sed -i "s/version: \".*\"/version: \"$version\"/g" Firefogg/components/Firefogg.js
sed -i "s/em:version>.*<\/em:version/em:version>$version<\/em:version/g" Firefogg/install.rdf

programs="ffmpeg2theora ffmpeg"

for os in linux macosx; do
  sed -i -e "s/linux/_os_/g" -e "s/macosx/_os_/g" -e "s/win32/_os_/g" -e "s/_os_/$os/g" Firefogg/install.rdf
  mkdir -p Firefogg/bin
  rm -f Firefogg/bin/*
  for prog in $programs; do
    cp bin/$prog.$os Firefogg/bin/$prog
  done
  echo "creating website/$os/Firefogg-$version.xpi"
  create_xpi
done

os="win32"
sed -i -e "s/linux/_os_/g" -e "s/macosx/_os_/g" -e "s/win32/_os_/g" -e "s/_os_/$os/g" Firefogg/install.rdf
rm -f Firefogg/bin/*
for prog in $programs; do
  cp bin/$prog.exe Firefogg/bin/$prog.exe
done

echo "creating website/$os/Firefogg-$version.xpi"
create_xpi

#cleanup
sed -i -e "s/linux/_os_/g" -e "s/macosx/_os_/g" -e "s/win32/_os_/g" -e "s/_os_/linux/g" Firefogg/install.rdf
sed -i "s/version: \".*\"/version: \"git\"/g" Firefogg/components/Firefogg.js
sed -i "s/em:version>.*<\/em:version/em:version>git<\/em:version/g" Firefogg/install.rdf

for prog in $programs; do
  rm -f Firefogg/bin/$prog.exe Firefogg/bin/$prog
done

#website
if [ "x$1" == "x--release" ]; then

    test -e website || exit 0
    webroot=website
    for os in linux macosx win32; do
      cp dist/Firefogg-$version.$os.xpi $webroot/$os/Firefogg-$version.xpi

FIREFOGG1_VERSION=`ls  $webroot/${os}/Firefogg-1.2* | tail -1 | awk '{print $1}' | cut -d- -f2| tr "." " " |awk '{print $1"."$2"."$3}'`

FIREFOGG4_VERSION=2.0.21
FIREFOGG5_VERSION=`ls  $webroot/${os}/Firefogg-2.5* | tail -1 | awk '{print $1}' | cut -d- -f2| tr "." " " |awk '{print $1"."$2"."$3}'`
FIREFOGG6_VERSION=`ls  $webroot/${os}/Firefogg-2.6* | tail -1 | awk '{print $1}' | cut -d- -f2| tr "." " " |awk '{print $1"."$2"."$3}'`
FIREFOGG9_VERSION=`ls  $webroot/${os}/Firefogg-2.9* | tail -1 | awk '{print $1}' | cut -d- -f2| tr "." " " |awk '{print $1"."$2"."$3}'`
FIREFOGG9_VERSION="$version"

XPI1=website/${os}/Firefogg-${FIREFOGG1_VERSION}.xpi

XPI4=website/${os}/Firefogg-${FIREFOGG4_VERSION}.xpi
XPI5=website/${os}/Firefogg-${FIREFOGG5_VERSION}.xpi
XPI6=website/${os}/Firefogg-${FIREFOGG6_VERSION}.xpi
XPI9=website/${os}/Firefogg-${FIREFOGG9_VERSION}.xpi

FIREFOGG1_SHA1=`sha1sum $XPI1 | cut -f1 -d' '`

FIREFOGG4_SHA1=`sha1sum $XPI4 | cut -f1 -d' '`
FIREFOGG5_SHA1=`sha1sum $XPI5 | cut -f1 -d' '`
FIREFOGG6_SHA1=`sha1sum $XPI6 | cut -f1 -d' '`
FIREFOGG9_SHA1=`sha1sum $XPI9 | cut -f1 -d' '`
      
cwd=`pwd`
cd $webroot/$os
ln -sf Firefogg-$FIREFOGG9_VERSION.xpi Firefogg.xpi
cd $cwd

cat >$webroot/$os/update.rdf  << EOT
<?xml version="1.0"?>
<RDF:RDF xmlns:em="http://www.mozilla.org/2004/em-rdf#"
         xmlns:NC="http://home.netscape.com/NC-rdf#"
         xmlns:RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <RDF:Description RDF:about="rdf:#\$fmrna9" em:version="${FIREFOGG9_VERSION}">
    <em:targetApplication RDF:resource="rdf:#\$imrna9"/>
  </RDF:Description>
  <RDF:Description RDF:about="rdf:#\$fmrna6" em:version="${FIREFOGG6_VERSION}">
    <em:targetApplication RDF:resource="rdf:#\$imrna6"/>
  </RDF:Description>
  <RDF:Description RDF:about="rdf:#\$fmrna5" em:version="${FIREFOGG5_VERSION}">
    <em:targetApplication RDF:resource="rdf:#\$imrna5"/>
  </RDF:Description>
  <RDF:Description RDF:about="rdf:#\$fmrna2" em:version="${FIREFOGG4_VERSION}">
    <em:targetApplication RDF:resource="rdf:#\$imrna2"/>
  </RDF:Description>
  <RDF:Description RDF:about="rdf:#\$fmrna1" em:version="${FIREFOGG1_VERSION}">
    <em:targetApplication RDF:resource="rdf:#\$imrna1"/>
  </RDF:Description>
  <RDF:Description RDF:about="urn:mozilla:extension:firefogg@firefogg.org"
                   em:signature="MIGTMA0GCSqGSIb3DQEBDQUAA4GBAHfOkuH/CvCW07f1E07J0oF/A2+NjrWoyapo872bFPL7cLeseo+SUGP/G786Fw3Qmxo5dYcquQ4pAvBhKBUe/8dZD2OqbwmxWO3RYRy4o3hhV25jBOAvmqLBtAptnTdAxUU9QotT4XnFdcRlbv/oX092ljpnFctTmMeLFKYAnjJF">
    <em:updates RDF:resource="rdf:#\$4mrna2"/>
  </RDF:Description>
  <RDF:Description RDF:about="rdf:#\$imrna9"
       em:id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
       em:minVersion="7.0b1"
       em:maxVersion="20.*"
       em:updateLink="https://firefogg.org/${os}/Firefogg-${FIREFOGG9_VERSION}.xpi"
       em:updateHash="sha1:${FIREFOGG9_SHA1}" />
  <RDF:Description RDF:about="rdf:#\$imrna6"
       em:id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
       em:minVersion="6.0b1"
       em:maxVersion="6.*"
       em:updateLink="https://firefogg.org/${os}/Firefogg-${FIREFOGG6_VERSION}.xpi"
       em:updateHash="sha1:${FIREFOGG6_SHA1}" />
  <RDF:Description RDF:about="rdf:#\$imrna5"
       em:id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
       em:minVersion="5.0b2"
       em:maxVersion="5.0.*"
       em:updateLink="https://firefogg.org/${os}/Firefogg-${FIREFOGG5_VERSION}.xpi"
       em:updateHash="sha1:${FIREFOGG5_SHA1}" />
  <RDF:Description RDF:about="rdf:#\$imrna2"
       em:id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
       em:minVersion="4.0b2"
       em:maxVersion="5.0b1"
       em:updateLink="https://firefogg.org/${os}/Firefogg-${FIREFOGG4_VERSION}.xpi"
       em:updateHash="sha1:${FIREFOGG4_SHA1}" />
  <RDF:Description RDF:about="rdf:#\$imrna1"
       em:id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
       em:minVersion="3.0.*"
       em:maxVersion="4.0b1"
       em:updateLink="https://firefogg.org/${os}/Firefogg-${FIREFOGG1_VERSION}.xpi"
       em:updateHash="sha1:${FIREFOGG1_SHA1}"
       em:updateInfoURL="https://firefogg.org/update/Firefogg-${FIREFOGG1_VERSION}.xhtml" />
  <RDF:Seq RDF:about="rdf:#\$4mrna2">
    <RDF:li RDF:resource="rdf:#\$fmrna1"/>
    <RDF:li RDF:resource="rdf:#\$fmrna2"/>
    <RDF:li RDF:resource="rdf:#\$fmrna5"/>
    <RDF:li RDF:resource="rdf:#\$fmrna6"/>
    <RDF:li RDF:resource="rdf:#\$fmrna9"/>
  </RDF:Seq>
</RDF:RDF>
EOT
    done
    sed  -i \
        -e "s/: '2.0.*'/: '${FIREFOGG4_VERSION}'/g" \
        -e "s/: '2.5.*'/: '${FIREFOGG5_VERSION}'/g" \
        -e "s/: '2.6.*'/: '${FIREFOGG6_VERSION}'/g" \
        -e "s/: '[3-9][0-9]*'/: '${FIREFOGG9_VERSION}'/g" \
        -e "s/: '1.2.*'/: '${FIREFOGG1_VERSION}'/g"  \
        $webroot/index.html
fi
