PigPulse cough classifier — on-device bundle for the Raspberry Pi
=================================================================

cnn14_16k_body.onnx : frozen PANNs Cnn14_16k from bn0 onward.
                      input  logmel  (batch, 1, frames, 64) float32
                      output embedding (batch, 2048) float32
melW.npy            : librosa mel filterbank (257 x 64), as used by PANNs
hann512.npy         : periodic Hann window, n_fft=512
head.json           : logistic head (2048 coef + intercept + threshold)

Front-end (numpy, no torch): reflect-pad 256 -> 512-frame STFT, hop 160
-> |X|^2 -> x melW -> 10*log10(max(x,1e-10)). Verified against torch:
max log-mel diff 0.0018 dB, cosine 1.000000, max |dp| 2.1e-06.
