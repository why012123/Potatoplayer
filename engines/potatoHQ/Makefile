# potatoHQ — build (no external build system required).
CXX      ?= clang++
CXXFLAGS ?= -std=c++20 -O2 -g -Wall -Wextra -Wno-unused-parameter -Wno-missing-field-initializers
DEPFLAGS := -MMD -MP
LDFLAGS  ?=
INC      := -Isrc

BUILD    := build
CORE_SRC := \
  src/json.cpp \
  src/io/wav.cpp \
  src/io/dsf.cpp \
  src/dsp/filters.cpp \
  src/dsp/resampler.cpp \
  src/dsp/dither.cpp \
  src/dsp/sdm.cpp \
  src/dsp/dop.cpp \
  src/dsp/eq.cpp \
  src/dsp/spatial.cpp \
  src/dsp/spectrum.cpp \
  src/dsp/crossfeed.cpp

FFMPEG_PKGS := libavformat libavcodec libswresample libavutil
# pkg-config is not installed on this machine; Homebrew prefix is fixed.
FFMPEG_PREFIX ?= /opt/homebrew
FFMPEG_CFLAGS := -I$(FFMPEG_PREFIX)/include
FFMPEG_LIBS   := -L$(FFMPEG_PREFIX)/lib -lavformat -lavcodec -lswresample -lavutil

ENGINE_SRC := src/decode/ffmpeg_decoder.cpp src/out/coreaudio_out.cpp src/engine.cpp
APP_SRC    := src/main.cpp src/rpc.cpp

CORE_OBJ   := $(patsubst src/%.cpp,$(BUILD)/obj/%.o,$(CORE_SRC))
ENGINE_OBJ := $(patsubst src/%.cpp,$(BUILD)/obj/%.o,$(ENGINE_SRC))
APP_OBJ    := $(patsubst src/%.cpp,$(BUILD)/obj/%.o,$(APP_SRC))
TEST_SRC   := tests/test_dsp.cpp

.PHONY: all core app tests clean run-tests measure

all: app tests

$(BUILD)/libpotatohq.a: $(CORE_OBJ)
	@mkdir -p $(dir $@)
	ar rcs $@ $^

$(BUILD)/obj/%.o: src/%.cpp
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) $(DEPFLAGS) $(INC) $(FFMPEG_CFLAGS) -c $< -o $@

$(BUILD)/potatohq: $(APP_OBJ) $(ENGINE_OBJ) $(BUILD)/libpotatohq.a
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) $(APP_OBJ) $(ENGINE_OBJ) $(BUILD)/libpotatohq.a $(FFMPEG_LIBS) \
	  -framework CoreAudio -framework AudioToolbox -framework CoreFoundation -o $@

$(BUILD)/phq_tests: $(TEST_SRC) $(BUILD)/libpotatohq.a
	@mkdir -p $(dir $@)
	$(CXX) $(CXXFLAGS) $(INC) $(TEST_SRC) $(BUILD)/libpotatohq.a $(FFMPEG_LIBS) \
	  -framework CoreAudio -framework AudioToolbox -framework CoreFoundation -o $@

app: $(BUILD)/potatohq
tests: $(BUILD)/phq_tests

core: $(BUILD)/libpotatohq.a

run-tests: $(BUILD)/phq_tests
	./$(BUILD)/phq_tests

-include $(CORE_OBJ:.o=.d) $(ENGINE_OBJ:.o=.d) $(APP_OBJ:.o=.d)

clean:
	rm -rf $(BUILD)
