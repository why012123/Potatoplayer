// Exercise production rate switching against a simulated HAL; never changes a real device.
#include <CoreAudio/CoreAudio.h>
static bool hasProperty = true;
static Boolean writable = true;
static OSStatus queryStatus = noErr, writeStatus = noErr;
static Float64 deviceRate = 48000;
static int writes = 0;
static Boolean mockHas(AudioObjectID, const AudioObjectPropertyAddress*) { return hasProperty; }
static OSStatus mockSettable(AudioObjectID, const AudioObjectPropertyAddress*, Boolean* value) {
  if (!value) return kAudioHardwareIllegalOperationError;
  *value = writable; return queryStatus;
}
static OSStatus mockGet(AudioObjectID, const AudioObjectPropertyAddress*, UInt32, const void*, UInt32*, void* value) {
  *static_cast<Float64*>(value)=deviceRate; return noErr;
}
static OSStatus mockSet(AudioObjectID, const AudioObjectPropertyAddress*, UInt32, const void*, UInt32, const void* value) {
  ++writes; if(writeStatus==noErr) deviceRate=*static_cast<const Float64*>(value); return writeStatus;
}
#define AudioObjectHasProperty mockHas
#define AudioObjectIsPropertySettable mockSettable
#define AudioObjectGetPropertyData mockGet
#define AudioObjectSetPropertyData mockSet
#include "out/coreaudio_out.cpp"
#include <cstdio>
int main() {
  int failures=0, checks=0;
  auto check=[&](bool ok,const char* name){++checks;if(!ok){++failures;std::printf("FAIL: %s\n",name);}};
  check(phq::setNominalRate(1,96000)&&deviceRate==96000&&writes==1,"switch supported rate");
  check(phq::setNominalRate(1,96000)&&writes==1,"same rate avoids device write");
  check(phq::setNominalRate(1,48000)&&deviceRate==48000,"restore previous rate");
  writable=false; check(!phq::setNominalRate(1,96000)&&writes==2,"read-only device");
  writable=true; queryStatus=kAudioHardwareIllegalOperationError;
  check(!phq::setNominalRate(1,96000)&&writes==2,"query failure");
  queryStatus=noErr; hasProperty=false;
  check(!phq::setNominalRate(1,96000)&&writes==2,"missing property");
  hasProperty=true; writeStatus=kAudioHardwareIllegalOperationError;
  check(!phq::setNominalRate(1,96000)&&deviceRate==48000,"device rejects rate");
  std::printf("Device rate: %d checks, %d failures\n",checks,failures);return failures?1:0;
}
